-- ============================================================================
--  ПОЧИНКА ПЕРЕКЛЮЧАТЕЛЯ «ПОДТВЕРЖДЕНИЕ ОПЛАТЫ: АВТОМАТИЧЕСКИ / ВРУЧНУЮ»
--
--  Переключатель писал настройку через общую admin_set_setting — а эта
--  функция в репозитории нигде не определена (она живая, как и сама таблица
--  app_settings), и я не знаю, что внутри. Самое вероятное объяснение, почему
--  payments_enabled переключался, а payments_auto_grant — нет: если
--  admin_set_setting делает UPDATE по уже существующей строке, а не UPSERT,
--  то для НОВОГО ключа, которого в таблице ещё не было, обновление просто не
--  находит строк — и тихо ничего не меняет, без единой ошибки.
--
--  Решение — не гадать, а довериться только тому коду, который я сам написал
--  и проверил: отдельная функция read_payments_auto_grant()/
--  admin_set_payments_auto_grant() именно для этой настройки, с явным
--  UPSERT и собственным, понятным форматом (boolean, без догадок о типе
--  колонки). Админка и вебхук теперь читают и пишут только через них.
--
--  Идемпотентна: можно вставить в Supabase → SQL Editor целиком.
-- ============================================================================

create table if not exists public.app_flags (
  key        text primary key,
  value      boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.app_flags enable row level security;
-- Читать можно всем (это не секрет — та же открытость, что у payments_enabled
-- в app_settings), писать — только через функцию ниже.
do $$ begin
  create policy "app_flags readable" on public.app_flags for select using (true);
exception when duplicate_object then null; end $$;

insert into public.app_flags (key, value)
values ('payments_auto_grant', true)
on conflict (key) do nothing;

-- ── Чтение: и для сайта, и для вебхука (вебхук всё равно использует сервисный
-- ключ, который RLS обходит, но так проще — один путь для всех) ────────────
create or replace function public.payments_auto_grant()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select value from public.app_flags where key = 'payments_auto_grant'), true);
$$;
revoke execute on function public.payments_auto_grant() from public, anon;
grant  execute on function public.payments_auto_grant() to authenticated;
-- service_role — то, чем пользуется вебхук, — EXECUTE не отзывался, значит
-- вызвать сможет и он: REVOKE выше её не касается.

-- ── Запись: только админ, только через явный UPSERT ─────────────────────────
create or replace function public.admin_set_payments_auto_grant(p_auto boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_auto is null then raise exception 'Значение обязательно (true или false).'; end if;

  insert into public.app_flags (key, value, updated_at, updated_by)
  values ('payments_auto_grant', p_auto, now(), auth.uid())
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end;
$$;
revoke execute on function public.admin_set_payments_auto_grant(boolean) from public, anon;
grant  execute on function public.admin_set_payments_auto_grant(boolean) to authenticated;

-- Разовый перенос: если в app_settings уже лежало осмысленное значение (кто-то
-- всё же сумел его туда записать раньше), подхватываем его, а не сбрасываем
-- на «автоматически» молча.
do $$
declare
  v_type text;
  v_val  text;
begin
  select data_type into v_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'app_settings' and column_name = 'value';
  if v_type is not null then
    execute format(
      'select value::text from public.app_settings where key = %L', 'payments_auto_grant'
    ) into v_val;
    if v_val is not null then
      update public.app_flags
         set value = not (lower(trim(both '"' from v_val)) = 'false'), updated_at = now()
       where key = 'payments_auto_grant';
    end if;
  end if;
exception when others then
  raise notice 'Перенос из app_settings пропущен: %', sqlerrm;
end $$;
