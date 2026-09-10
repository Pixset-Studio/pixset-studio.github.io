-- Pixset Studio: порядок бейджей у ника задаёт студия, а не игрок.
--
-- В 0014 порядок раскладывал сам игрок из кабинета. Решили иначе: бейджи —
-- отметки студии, и то, какая из них стоит ближе к нику, решает студия. За
-- игроком остаётся только выбор, какой из необязательных бейджей занимает
-- единственный слот, — это по-прежнему его дело.
--
-- Поэтому badge_order (доступная любому вошедшему) уходит, а её место
-- занимает admin_badge_order — та же работа, но по нику и только для
-- администратора. Уже расставленный порядок остаётся как есть.
--
-- Применить: Supabase → SQL Editor → выполнить целиком.

drop function if exists public.badge_order(text[]);

create or replace function public.admin_badge_order(p_nickname text, p_slugs text[])
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

  if p_slugs is null then return; end if;
  if array_length(p_slugs, 1) > 50 then raise exception 'too_many_badges'; end if;

  -- Сначала все бейджи игрока — в конец очереди, потом перечисленные по местам.
  -- Незнакомые слаги молча пропускаем: список приходит из браузера, и падать
  -- из-за устаревшей страницы незачем.
  update public.user_badges set nick_order = 999 where user_id = target;

  update public.user_badges ub
     set nick_order = pos.ord
    from (select slug, ordinality::integer as ord
            from unnest(p_slugs) with ordinality as t(slug, ordinality)) pos
    join public.badges b on b.slug = pos.slug
   where ub.user_id = target and ub.badge_id = b.id;
end;
$$;

revoke execute on function public.admin_badge_order(text, text[]) from public, anon;
grant  execute on function public.admin_badge_order(text, text[]) to authenticated;
