-- Pixset Studio: доски по показателям прогресса.
--
-- Дополнение к 0004: там таблица рекордов по режимам (очки за забег), здесь —
-- доски по звёздам, кристаллам, монетам, достижениям и уровням.
--
-- Отдельной таблицы под них нет намеренно. Игра уже публикует все эти числа в
-- game_stats.data после каждого сохранения; вторая копия однажды разошлась бы с
-- первой, и стало бы непонятно, какая из них правда.
--
-- Применено 3 сентября 2026 через MCP вместе с 0004.

create function public.top_stats(
  p_game_slug text,
  p_field text,
  p_limit int default 50
)
returns table (
  rank int,
  user_id uuid,
  nickname text,
  avatar_url text,
  value bigint,
  data jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  -- Белый список полей: набор колонок остаётся предсказуемым, даже если игра
  -- начнёт публиковать в витрину что-то ещё. Строки с нечисловым или нулевым
  -- значением в доску не попадают — ноль в таблице рекордов не результат.
  select
    row_number() over (order by (g.data->>p_field)::bigint desc, g.updated_at asc)::int,
    g.user_id,
    p.nickname,
    p.avatar_url,
    (g.data->>p_field)::bigint,
    g.data,
    g.updated_at
  from public.game_stats g
  join public.profiles p on p.id = g.user_id
  where g.game_slug = p_game_slug
    and p_field in ('levels','stars','crystals','coins','ach','logs','bosses',
                    'secrets','worlds','rainbow','perfect','streak','playtime',
                    'score','hardcore','jumps','stompKills','blasterKills',
                    'burnKills','freezeKills')
    and (g.data->>p_field) ~ '^[0-9]+$'
    and (g.data->>p_field)::bigint > 0
  order by (g.data->>p_field)::bigint desc, g.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create function public.my_stat_rank(
  p_game_slug text,
  p_field text
)
returns table (rank int, value bigint, total int)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select g.user_id,
           (g.data->>p_field)::bigint as value,
           row_number() over (order by (g.data->>p_field)::bigint desc, g.updated_at asc)::int as rank,
           count(*) over ()::int as total
      from public.game_stats g
     where g.game_slug = p_game_slug
       and p_field in ('levels','stars','crystals','coins','ach','logs','bosses',
                       'secrets','worlds','rainbow','perfect','streak','playtime',
                       'score','hardcore','jumps','stompKills','blasterKills',
                       'burnKills','freezeKills')
       and (g.data->>p_field) ~ '^[0-9]+$'
       and (g.data->>p_field)::bigint > 0
  )
  select rank, value, total from ranked where user_id = auth.uid();
$$;

-- Доски видно всем; своё место — только вошедшему.
revoke execute on function public.my_stat_rank(text, text) from public, anon;
grant execute on function public.top_stats(text, text, int) to anon, authenticated;
grant execute on function public.my_stat_rank(text, text) to authenticated;
