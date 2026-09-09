-- ============================================================================
--  Блокировка аккаунтов
--
--  Бан бывает двух видов: навсегда и до даты. Хранится он в самом профиле,
--  потому что «забанен ли игрок» спрашивают буквально все проверки, и лишний
--  join к отдельной таблице пришлось бы писать в каждой из них.
--
--      banned_at    — когда заблокировали (null = не блокировали никогда)
--      banned_until — до какого времени; null при заполненном banned_at
--                     означает «навсегда»
--      ban_reason   — причина, её видит сам игрок на странице блокировки
--
--  Вход мы НЕ ломаем: игрок должен войти, чтобы увидеть причину и таймер до
--  разблокировки. Вместо этого закрыты все действия — и на уровне политик
--  (прямые записи), и внутри функций (они работают в обход политик).
-- ============================================================================

alter table public.profiles
  add column if not exists banned_at    timestamptz,
  add column if not exists banned_until timestamptz,
  add column if not exists ban_reason   text,
  add column if not exists banned_by    uuid references auth.users(id);

comment on column public.profiles.banned_until is
  'До какого времени действует блокировка. NULL при заполненном banned_at — навсегда.';

-- ── Проверки ────────────────────────────────────────────────────────────────

create or replace function public.is_banned(p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user
       and p.banned_at is not null
       and (p.banned_until is null or p.banned_until > now())
  );
$$;

/* Одна строка на всю проверку — её вставляют в начало каждой функции, которая
   что-то меняет от имени игрока. Текст ошибки разбирает humanError в SDK. */
create or replace function public.assert_not_banned()
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_banned() then raise exception 'account_banned'; end if;
end;
$$;

grant execute on function public.is_banned(uuid) to authenticated, anon;
grant execute on function public.assert_not_banned() to authenticated;

-- ── Что видит сам заблокированный ───────────────────────────────────────────
--  Страница блокировки читает эту витрину под собственной сессией игрока:
--  причина и срок — это его данные, чужие сюда не попадают.

drop view if exists public.my_ban;
create view public.my_ban with (security_invoker = true) as
select p.id,
       p.nickname,
       p.banned_at,
       p.banned_until,
       p.ban_reason,
       (p.banned_at is not null
        and (p.banned_until is null or p.banned_until > now())) as active
  from public.profiles p
 where p.id = (select auth.uid());

grant select on public.my_ban to authenticated;

-- ── Управление из админки ───────────────────────────────────────────────────

create or replace function public.admin_ban(
  p_nickname text,
  p_until    timestamptz,   -- null = навсегда
  p_reason   text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select id into v_id from public.profiles
   where lower(nickname) = lower(btrim(coalesce(p_nickname, '')));
  if v_id is null then raise exception 'player_not_found'; end if;

  -- Админы друг друга не банят: панель управления так можно потерять целиком.
  if exists (select 1 from public.profiles where id = v_id and is_admin) then
    raise exception 'cannot_ban_admin';
  end if;

  -- Причина обязательна: её показывают игроку, и «просто так» там быть нечему.
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'ban_reason_required';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'ban_until_past';
  end if;

  update public.profiles
     set banned_at    = now(),
         banned_until = p_until,
         ban_reason   = btrim(p_reason),
         banned_by    = (select auth.uid())
   where id = v_id;

  return jsonb_build_object('id', v_id, 'until', p_until);
end;
$$;

create or replace function public.admin_unban(p_nickname text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select id into v_id from public.profiles
   where lower(nickname) = lower(btrim(coalesce(p_nickname, '')));
  if v_id is null then raise exception 'player_not_found'; end if;

  update public.profiles
     set banned_at = null, banned_until = null, ban_reason = null, banned_by = null
   where id = v_id;
end;
$$;

/* Список для админки: и действующие блокировки, и истёкшие — по последним
   видно, кого уже наказывали. */
create or replace function public.admin_bans()
returns table(
  nickname     text,
  email        text,
  banned_at    timestamptz,
  banned_until timestamptz,
  ban_reason   text,
  banned_by    text,
  active       boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  return query
    select p.nickname,
           u.email::text,
           p.banned_at,
           p.banned_until,
           p.ban_reason,
           a.nickname,
           (p.banned_until is null or p.banned_until > now())
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.profiles a on a.id = p.banned_by
     where p.banned_at is not null
     order by (p.banned_until is null or p.banned_until > now()) desc, p.banned_at desc
     limit 500;
end;
$$;

grant execute on function public.admin_ban(text, timestamptz, text) to authenticated;
grant execute on function public.admin_unban(text) to authenticated;
grant execute on function public.admin_bans() to authenticated;

-- ── Поля блокировки правит только админка ───────────────────────────────────
--  profiles_guard уже возвращает на место поля, которые игрок менять не должен
--  (регион, права, дату регистрации). Блокировка — из того же списка, иначе
--  снять её можно было бы обычным update своего профиля.

create or replace function public.profiles_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Серверные роли (наши функции, вебхуки, админ-RPC) не ограничиваем.
  if coalesce(auth.role(), 'service_role') in ('service_role', 'supabase_admin') then
    return new;
  end if;

  new.id         := old.id;
  new.is_admin   := old.is_admin;
  new.created_at := old.created_at;
  -- Регион привязан к аккаунту: от него зависит цена, менять его игрок не может.
  new.country    := old.country;
  new.currency   := old.currency;

  -- Блокировку ставит и снимает только админ (admin_ban / admin_unban).
  if not public.is_admin() then
    new.banned_at    := old.banned_at;
    new.banned_until := old.banned_until;
    new.ban_reason   := old.ban_reason;
    new.banned_by    := old.banned_by;
  end if;

  if new.nickname is distinct from old.nickname then
    new.nickname_changed_at := now();
  end if;

  return new;
end;
$$;

-- ── Прямые записи ───────────────────────────────────────────────────────────
--  Всё, что клиент пишет в таблицы сам, закрывается прямо в политике.

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update
  using      ((select auth.uid()) = id and not public.is_banned())
  with check ((select auth.uid()) = id and not public.is_banned());

drop policy if exists "own saves write" on public.cloud_saves;
create policy "own saves write" on public.cloud_saves for insert
  with check ((select auth.uid()) = user_id and not public.is_banned());

drop policy if exists "own saves update" on public.cloud_saves;
create policy "own saves update" on public.cloud_saves for update
  using      ((select auth.uid()) = user_id and not public.is_banned())
  with check ((select auth.uid()) = user_id and not public.is_banned());

drop policy if exists "create own request" on public.friendships;
create policy "create own request" on public.friendships for insert
  with check ((select auth.uid()) = requester
              and status = 'pending'
              and not public.is_banned());

drop policy if exists "own stats upsert" on public.game_stats;
create policy "own stats upsert" on public.game_stats for insert
  with check ((select auth.uid()) = user_id and not public.is_banned());

drop policy if exists "own stats update" on public.game_stats;
create policy "own stats update" on public.game_stats for update
  using ((select auth.uid()) = user_id and not public.is_banned());

-- ── Действия через функции ──────────────────────────────────────────────────
--  Функции ниже объявлены security definer и политики обходят, поэтому запрет
--  вставляется в их тело. Правка делается по месту: каждая из них начинается с
--  проверки «вошёл ли игрок», и наша строка встаёт сразу за ней.

do $$
declare
  fn   text;
  src  text;
  note text := E'  perform public.assert_not_banned();   -- забаненному действие запрещено\n';
begin
  foreach fn in array array[
    'public.update_nickname(text)',
    'public.update_locale(text)',
    'public.set_country_visibility(text)',
    'public.badge_pin(text, boolean)',
    'public.friend_request(text)',
    'public.friend_accept(uuid)',
    'public.invite_to_room(text, text, text, text)',
    'public.publish_game_stats(text, jsonb)',
    'public.submit_score(text, leaderboard_mode, bigint)',
    'public.region_request(text, text)',
    'public.region_request_cancel()',
    'public.create_order(text)',
    'public.delete_my_account()'
  ] loop
    src := pg_get_functiondef(fn::regprocedure);
    continue when position('assert_not_banned' in src) > 0;

    src := regexp_replace(src, '(\n[ \t]*begin[ \t]*\r?\n)', E'\\1' || note);
    if position('assert_not_banned' in src) = 0 then
      raise exception 'не нашлось место для проверки в %', fn;
    end if;
    execute src;
  end loop;
end;
$$;

-- ── Чужой профиль ───────────────────────────────────────────────────────────
--  Страница профиля показывает плашку «аккаунт заблокирован» вместо статистики:
--  иначе непонятно, почему у игрока всё замерло.

create or replace function public.public_profile(p_nickname text)
returns jsonb
language sql stable set search_path = public as $function$
  select jsonb_build_object(
    'id', p.id,
    'nickname', p.nickname,
    'avatar_url', p.avatar_url,
    'created_at', p.created_at,
    'banned', (p.banned_at is not null
               and (p.banned_until is null or p.banned_until > now())),
    'banned_until', case
      when p.banned_at is not null
       and (p.banned_until is null or p.banned_until > now()) then p.banned_until
      else null
    end,
    'country', case
      when p.country_visibility = 'public' then p.country
      when p.id = (select auth.uid()) then p.country
      when p.country_visibility = 'friends' and exists (
             select 1 from public.friendships f
              where f.status = 'accepted'
                and ((f.requester = (select auth.uid()) and f.addressee = p.id)
                  or (f.addressee = (select auth.uid()) and f.requester = p.id))
           ) then p.country
      else null
    end,
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', b.slug,
        'title_ru', b.title_ru,
        'title_en', b.title_en,
        'hint_ru', b.hint_ru,
        'hint_en', b.hint_en,
        'icon_url', b.icon_url,
        'color', b.color,
        'nick', b.nick_forced or (b.nick_allowed and ub.pinned)
      ) order by b.nick_forced desc, ub.granted_at)
      from public.user_badges ub
      join public.badges b on b.id = ub.badge_id
      where ub.user_id = p.id and not b.hide_in_profile
    ), '[]'::jsonb),
    'games', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_slug', s.game_slug,
        'title', g.title,
        'data', s.data,
        'updated_at', s.updated_at
      ) order by s.updated_at desc)
      from public.game_stats s
      join public.games g on g.slug = s.game_slug
      where s.user_id = p.id
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.nickname = p_nickname;
$function$;
