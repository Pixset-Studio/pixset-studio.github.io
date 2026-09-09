-- Pixset Studio: бейджи игроков.
--
-- Бейдж — это отметка студии рядом с ником: «бета-тестер», «победитель
-- турнира», «нашёл баг». Их придумывает и раздаёт администратор, игрок сам
-- себе выдать ничего не может — иначе отметка не значила бы ничего.
--
-- Иконка лежит прямо в строке, как аватар (data-URL): бейджей десятки, а не
-- тысячи, и отдельное хранилище с политиками доступа тут стоило бы дороже,
-- чем сама картинка. Размер ограничен, чтобы витрина профиля не распухала.
--
-- Применить: Supabase → SQL Editor → выполнить целиком. Повторный запуск
-- упадёт на существующих объектах — это правильнее, чем молча перетереть.

-- ── Каталог бейджей ───────────────────────────────────────────────────────
create table public.badges (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,          -- 'beta-tester', 'tournament-2026'
  title_ru    text not null,
  title_en    text not null,
  -- Подсказка при наведении: за что он выдан.
  hint_ru     text,
  hint_en     text,
  icon_url    text,                          -- data:image/...;base64,…
  color       text,                          -- акцент рамки, #rrggbb
  created_at  timestamptz not null default now(),

  constraint badge_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  -- 48 КБ хватает иконке 96×96 с запасом; всё, что больше, — чья-то ошибка.
  constraint badge_icon_small check (icon_url is null or length(icon_url) <= 49152),
  constraint badge_icon_is_image check (
    icon_url is null or icon_url ~ '^data:image/(png|jpeg|webp);base64,'
  ),
  constraint badge_color_shape check (color is null or color ~ '^#[0-9a-fA-F]{6}$')
);

-- ── Кому выдан ────────────────────────────────────────────────────────────
create table public.user_badges (
  user_id     uuid not null references auth.users(id) on delete cascade,
  badge_id    uuid not null references public.badges(id) on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references auth.users(id) on delete set null,
  primary key (user_id, badge_id)
);

create index user_badges_user_idx on public.user_badges (user_id, granted_at);

alter table public.badges      enable row level security;
alter table public.user_badges enable row level security;

-- Бейджи видно всем: они и существуют для того, чтобы их видели в профиле.
create policy "badges are public" on public.badges
  for select using (true);
create policy "granted badges are public" on public.user_badges
  for select using (true);

-- Заводит и меняет каталог только администратор. Права берём из профиля,
-- а не из клиента: клиент может сказать о себе что угодно.
create policy "admins manage badges" on public.badges
  for all using (
    exists (select 1 from public.profiles p
             where p.id = (select auth.uid()) and p.is_admin)
  ) with check (
    exists (select 1 from public.profiles p
             where p.id = (select auth.uid()) and p.is_admin)
  );

-- Выдача идёт только через RPC ниже (там ник переводится в user_id и
-- проверяются права), поэтому прямых политик записи для клиента нет.

-- ── Выдать и отозвать ─────────────────────────────────────────────────────
-- По нику: администратор знает ник игрока, а не его UUID.
create function public.badge_grant(p_nickname text, p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := (select auth.uid());
  target   uuid;
  badge    public.badges%rowtype;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = me and is_admin) then
    raise exception 'forbidden';
  end if;

  select id into target from public.profiles where nickname = p_nickname;
  if target is null then raise exception 'player_not_found'; end if;

  select * into badge from public.badges where slug = p_slug;
  if badge is null then raise exception 'badge_not_found'; end if;

  -- pinned берём из самого бейджа: «не для ника» не должен там оказаться,
  -- а всё остальное игрок видит рядом с ником сразу (см. 0008).
  insert into public.user_badges (user_id, badge_id, granted_by, pinned)
  values (target, badge.id, me, badge.nick_allowed)
  on conflict (user_id, badge_id) do nothing;   -- повторная выдача не ошибка
end;
$$;

create function public.badge_revoke(p_nickname text, p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := (select auth.uid());
  target uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = me and is_admin) then
    raise exception 'forbidden';
  end if;

  select id into target from public.profiles where nickname = p_nickname;
  if target is null then raise exception 'player_not_found'; end if;

  delete from public.user_badges ub
   using public.badges b
   where ub.badge_id = b.id and ub.user_id = target and b.slug = p_slug;
end;
$$;

-- Кому что выдано — для админки: список игроков одного бейджа.
create function public.badge_holders(p_slug text)
returns table (nickname text, avatar_url text, granted_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.nickname, p.avatar_url, ub.granted_at
    from public.user_badges ub
    join public.badges b  on b.id = ub.badge_id
    join public.profiles p on p.id = ub.user_id
   where b.slug = p_slug
   order by ub.granted_at desc;
$$;

-- ── Публичный профиль ─────────────────────────────────────────────────────
-- Дополняем витрину бейджами: карточка игрока показывает их рядом с ником.
-- Функция переопределяется целиком — так видно, что именно она отдаёт.
create or replace function public.public_profile(p_nickname text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'nickname', p.nickname,
    'avatar_url', p.avatar_url,
    'created_at', p.created_at,
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', b.slug,
        'title_ru', b.title_ru,
        'title_en', b.title_en,
        'hint_ru', b.hint_ru,
        'hint_en', b.hint_en,
        'icon_url', b.icon_url,
        'color', b.color
      ) order by ub.granted_at)
      from public.user_badges ub
      join public.badges b on b.id = ub.badge_id
      where ub.user_id = p.id
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
$$;

-- Свои бейджи вошедшему — для личного кабинета.
create view public.my_badges
with (security_invoker = true) as
  select b.slug, b.title_ru, b.title_en, b.hint_ru, b.hint_en,
         b.icon_url, b.color, ub.granted_at
    from public.user_badges ub
    join public.badges b on b.id = ub.badge_id
   where ub.user_id = (select auth.uid())
   order by ub.granted_at;

-- Postgres по умолчанию даёт EXECUTE роли PUBLIC — одного гранта мало.
revoke execute on function public.badge_grant(text, text)  from public, anon;
revoke execute on function public.badge_revoke(text, text) from public, anon;
revoke execute on function public.badge_holders(text)      from public, anon;

grant execute on function public.badge_grant(text, text)  to authenticated;
grant execute on function public.badge_revoke(text, text) to authenticated;
grant execute on function public.badge_holders(text)      to authenticated;
