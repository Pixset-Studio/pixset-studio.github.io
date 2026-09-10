-- Pixset Studio: иконка игры.
--
-- Списки лицензий («Мои игры», «Игры в аккаунте» в профиле, лицензии игрока в
-- админке) были рядами текста: название и дата. Иконка узнаётся быстрее любой
-- подписи, поэтому она теперь живёт в каталоге игр.
--
-- В отличие от бейджей и аватаров, здесь хранится ССЫЛКА, а не сама картинка.
-- У бейджа своего места на сайте нет, поэтому он и лежит в строке целиком; а у
-- игры логотип и так опубликован на её страницах — держать в базе вторую копию
-- на 30 килобайт base64 незачем. Путь от корня («/byte-blaster/assets/…»)
-- работает на обоих сайтах студии: домен у них общий.
--
-- Проверка пропускает три вида: путь от корня, https-адрес и data-URL — на
-- случай игры, у которой своей страницы ещё нет. Всё остальное (javascript:,
-- http: без шифрования) отсекается: значение уходит прямо в src картинки.
--
-- Применить: Supabase → SQL Editor → выполнить целиком.

alter table public.games
  add column icon_url text;

alter table public.games
  add constraint game_icon_small
  check (icon_url is null or length(icon_url) <= 49152),
  add constraint game_icon_shape
  check (icon_url is null
         or icon_url ~ '^/[^/]'
         or icon_url ~ '^https://'
         or icon_url ~ '^data:image/(png|jpeg|webp);base64,');

-- Публичный профиль: та же иконка рядом с игрой в списке лицензий.
create or replace function public.public_profile(p_nickname text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'nickname', p.nickname,
    'avatar_url', p.avatar_url,
    'created_at', p.created_at,
    'bio', p.bio,
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
    'licenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_slug', l.game_slug,
        'title', g.title,
        'icon_url', g.icon_url,
        'granted_at', l.granted_at
      ) order by l.granted_at)
      from public.licenses l
      join public.games g on g.slug = l.game_slug
      where l.user_id = p.id and l.revoked_at is null
    ), '[]'::jsonb),
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
      ) order by ub.nick_order, b.nick_forced desc, ub.granted_at)
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
$$;

-- Единственная пока игра студии.
update public.games
   set icon_url = '/byte-blaster/assets/logo.png'
 where slug = 'byte-blaster' and icon_url is null;
