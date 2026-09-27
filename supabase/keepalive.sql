-- usapon-lab が「利用なし」で自動停止しないよう、定期的に1行だけ更新するための仕組み。
-- Supabase ダッシュボード → SQL Editor に貼り付けて一度だけ実行する。
create table if not exists public.keepalive (
  id int primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now()
);
alter table public.keepalive enable row level security;
-- ポリシーは作らない（ブラウザからテーブルを直接読み書きさせない）。

create or replace function public.keepalive_ping()
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  insert into public.keepalive (id, pinged_at) values (1, now())
  on conflict (id) do update set pinged_at = excluded.pinged_at
  returning pinged_at;
$$;

revoke all on function public.keepalive_ping() from public;
grant execute on function public.keepalive_ping() to anon;
