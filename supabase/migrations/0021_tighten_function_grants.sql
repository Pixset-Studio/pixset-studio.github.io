-- Убираем лишние права на вызов функций.
--
-- Проверка безопасности Supabase показала, что часть функций с правами
-- владельца (security definer) доступна роли anon — то есть вызвать их можно
-- вообще без входа. Дыры это не даёт: админские функции первым делом
-- спрашивают is_admin() и постороннему отвечают отказом. Но открытая дверь,
-- за которой стоит охранник, — всё равно открытая дверь: её можно долбить
-- перебором, а любая будущая правка внутри рискует забыть про проверку.
--
-- Поэтому раздаём права по назначению:
--   • admin_*             — только вошедшим (внутри всё равно проверяется админ);
--   • служебные и триггерные — никому снаружи;
--   • всё, что нужно гостю (таблицы рекордов, профили, комнаты) — не трогаем.
--
-- Применить: Supabase → SQL Editor → выполнить целиком.

-- ВАЖНО про PUBLIC. Postgres выдаёт право на вызов функции роли PUBLIC, и она
-- наследуется всеми — в том числе anon. Отзыв «у anon» при этом не делает
-- ничего: проверено, функции продолжали отвечать. Поэтому отзываем у PUBLIC, а
-- нужным ролям выдаём явно.

-- ── Админские: гостю тут делать нечего ───────────────────────────────────────
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'admin\_%'
  loop
    execute 'revoke execute on function ' || f.sig || ' from public, anon';
    execute 'grant execute on function ' || f.sig || ' to authenticated';
  end loop;
end $$;

-- ── Служебные и триггерные: не место в открытом API ──────────────────────────
-- badge_slot_guard вызывается триггером, badges_autogrant и assert_not_banned —
-- изнутри других функций. Прямой вызов снаружи не нужен никому: внутренние
-- вызовы идут от владельца функции и на права вызывающего не смотрят.
revoke execute on function public.badge_slot_guard()     from public, anon, authenticated;
revoke execute on function public.badges_autogrant(uuid) from public, anon, authenticated;
revoke execute on function public.assert_not_banned()    from public, anon, authenticated;
revoke execute on function public.bb_rooms_sweep()       from public, anon, authenticated;
revoke execute on function public.ghosts_sweep()         from public, anon;
grant  execute on function public.ghosts_sweep()         to authenticated;

revoke execute on function public.scope_users(text)      from public, anon;
grant  execute on function public.scope_users(text)      to authenticated;

-- ── Требуют входа по смыслу ──────────────────────────────────────────────────
-- Обе берут auth.uid() и гостю всё равно откажут — просто не пускаем на порог.
revoke execute on function public.publish_game_stats(text, jsonb)        from public, anon;
grant  execute on function public.publish_game_stats(text, jsonb)        to authenticated;
revoke execute on function public.invite_to_room(text, text, text, text) from public, anon;
grant  execute on function public.invite_to_room(text, text, text, text) to authenticated;

-- ── Фиксированный search_path ────────────────────────────────────────────────
-- Без него функция ищет таблицы по пути вызывающего: подсунув свой schema,
-- можно подменить то, что она читает.
alter function public.currency_for_country(text) set search_path = public;
