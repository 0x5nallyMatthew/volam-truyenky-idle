-- ============================================================================
-- VÕ LÂM IDLE - SCHEMA DATABASE (Supabase / Postgres)
-- ============================================================================
-- CÁCH DÙNG:
--   1. Mở Supabase Dashboard -> SQL Editor -> New query
--   2. Dán toàn bộ file này -> Run
--   3. Chạy:  node server/check.js   để kiểm tra đã đủ bảng chưa
--
-- Script này IDEMPOTENT (chạy lại nhiều lần được), không xoá dữ liệu cũ.
-- Nếu bảng đã tồn tại với kiểu cột khác (ví dụ id kiểu uuid) thì câu lệnh
-- CREATE TABLE bị bỏ qua, phần ALTER TABLE bổ sung cột còn thiếu.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Bảng tài khoản người chơi
--    pass_hash: mật khẩu băm scrypt. Cột `password` cũ (bản client cũ lưu thô)
--    được giữ lại để tương thích; server sẽ tự nâng cấp sang scrypt khi đăng nhập.
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id          text primary key,
  username    text not null,
  pass_hash   text,
  password    text,
  created_at  timestamptz default now(),
  last_active timestamptz default now()
);
alter table public.users add column if not exists pass_hash text;
alter table public.users add column if not exists password text;
alter table public.users add column if not exists created_at timestamptz default now();
alter table public.users add column if not exists last_active timestamptz default now();
create unique index if not exists users_username_key on public.users (username);


-- ---------------------------------------------------------------------------
-- 2. Bản lưu đám mây (mỗi tài khoản nhiều slot, id = <user_id>_<slot>)
--    data: blob JSON {"v":2,"d":"<pack>","k":"<kho chung>"}
-- ---------------------------------------------------------------------------
create table if not exists public.saves (
  id         text primary key,
  user_id    text not null,
  slot       integer not null default 0,
  name       text,
  lvl        integer default 1,
  reborn     integer default 0,
  power      bigint default 0,
  fac        text,
  sex        integer default 0,
  data       text,
  updated_at timestamptz default now()
);
alter table public.saves add column if not exists user_id text;
alter table public.saves add column if not exists slot integer default 0;
alter table public.saves add column if not exists name text;
alter table public.saves add column if not exists lvl integer default 1;
alter table public.saves add column if not exists reborn integer default 0;
alter table public.saves add column if not exists power bigint default 0;
alter table public.saves add column if not exists fac text;
alter table public.saves add column if not exists sex integer default 0;
alter table public.saves add column if not exists data text;
alter table public.saves add column if not exists updated_at timestamptz default now();
create index if not exists saves_user_id_idx on public.saves (user_id);
create index if not exists saves_updated_idx on public.saves (updated_at desc);


-- ---------------------------------------------------------------------------
-- 3. Bảng xếp hạng (id = tên nhân vật -> chống trùng tên)
-- ---------------------------------------------------------------------------
create table if not exists public.rankings (
  id         text primary key,
  name       text not null,
  owner      text,
  fac        text,
  sex        integer default 0,
  lvl        integer default 1,
  reborn     integer default 0,
  power      bigint default 0,
  tower      integer default 0,
  bosses     integer default 0,
  gear       jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.rankings add column if not exists name text;
alter table public.rankings add column if not exists owner text;
alter table public.rankings add column if not exists fac text;
alter table public.rankings add column if not exists sex integer default 0;
alter table public.rankings add column if not exists lvl integer default 1;
alter table public.rankings add column if not exists reborn integer default 0;
alter table public.rankings add column if not exists power bigint default 0;
alter table public.rankings add column if not exists tower integer default 0;
alter table public.rankings add column if not exists bosses integer default 0;
alter table public.rankings add column if not exists gear jsonb default '{}'::jsonb;
alter table public.rankings add column if not exists updated_at timestamptz default now();
create index if not exists rankings_fac_idx on public.rankings (fac);
create index if not exists rankings_lvl_idx on public.rankings (lvl desc);
create index if not exists rankings_name_idx on public.rankings (name);


-- ---------------------------------------------------------------------------
-- 4. Chợ (vật phẩm đăng bán)
--    status: selling | sold | claimed | cancelled | system
-- ---------------------------------------------------------------------------
create table if not exists public.market_items (
  id          bigint generated always as identity primary key,
  seller_id   text not null,
  seller_name text,
  item_data   jsonb,
  item_name   text,
  item_type   text,
  item_level  integer default 1,
  price_type  text default 'gold',
  price       bigint default 0,
  status      text default 'selling',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.market_items add column if not exists seller_id text;
alter table public.market_items add column if not exists seller_name text;
alter table public.market_items add column if not exists item_data jsonb;
alter table public.market_items add column if not exists item_name text;
alter table public.market_items add column if not exists item_type text;
alter table public.market_items add column if not exists item_level integer default 1;
alter table public.market_items add column if not exists price_type text default 'gold';
alter table public.market_items add column if not exists price bigint default 0;
alter table public.market_items add column if not exists status text default 'selling';
alter table public.market_items add column if not exists created_at timestamptz default now();
alter table public.market_items add column if not exists updated_at timestamptz default now();
create index if not exists market_items_seller_idx on public.market_items (seller_id);
create index if not exists market_items_status_idx on public.market_items (status);


-- ---------------------------------------------------------------------------
-- 5. Chat thế giới
-- ---------------------------------------------------------------------------
create table if not exists public.chat (
  id         bigint generated always as identity primary key,
  cid        text,
  name       text,
  fac        text,
  lvl        integer default 1,
  msg        text,
  item       jsonb,
  created_at timestamptz default now()
);
alter table public.chat add column if not exists cid text;
alter table public.chat add column if not exists name text;
alter table public.chat add column if not exists fac text;
alter table public.chat add column if not exists lvl integer default 1;
alter table public.chat add column if not exists msg text;
alter table public.chat add column if not exists item jsonb;
alter table public.chat add column if not exists created_at timestamptz default now();
create index if not exists chat_created_idx on public.chat (created_at desc);


-- ---------------------------------------------------------------------------
-- 6. Nhân vật đang hoạt động (dùng cho đếm online)
-- ---------------------------------------------------------------------------
create table if not exists public.chars (
  owner   text primary key,
  name    text,
  fac     text,
  lvl     integer default 1,
  updated timestamptz default now()
);
alter table public.chars add column if not exists name text;
alter table public.chars add column if not exists fac text;
alter table public.chars add column if not exists lvl integer default 1;
alter table public.chars add column if not exists updated timestamptz default now();


-- ---------------------------------------------------------------------------
-- 7. Cấu hình toàn server (GM): tỷ lệ EXP + thông báo
-- ---------------------------------------------------------------------------
create table if not exists public.server_settings (
  id         integer primary key default 1,
  exp_rate   numeric default 1,
  notice     text default '',
  updated_at timestamptz default now()
);
alter table public.server_settings add column if not exists exp_rate numeric default 1;
alter table public.server_settings add column if not exists notice text default '';
alter table public.server_settings add column if not exists updated_at timestamptz default now();
insert into public.server_settings (id, exp_rate, notice) values (1, 1, '')
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 8. Hàm đếm người chơi đang online
-- ---------------------------------------------------------------------------
create or replace function public.jx_online()
returns integer
language sql
stable
as $$
  select count(*)::integer from public.chars where updated > now() - interval '5 minutes';
$$;


-- ---------------------------------------------------------------------------
-- 9. Bảo mật (RLS)
--    Mọi thao tác GHI đều đi qua máy chủ Node bằng service_role key (bỏ qua RLS).
--    Bật RLS để khoá anon key không thể tự ý ghi/đọc dữ liệu nhạy cảm.
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.saves enable row level security;
alter table public.rankings enable row level security;
alter table public.market_items enable row level security;
alter table public.chat enable row level security;
alter table public.chars enable row level security;
alter table public.server_settings enable row level security;

-- Đọc công khai: bảng xếp hạng, chat, cấu hình server
drop policy if exists "public_read_rankings" on public.rankings;
create policy "public_read_rankings" on public.rankings for select using (true);
drop policy if exists "public_read_chat" on public.chat;
create policy "public_read_chat" on public.chat for select using (true);
drop policy if exists "public_read_server_settings" on public.server_settings;
create policy "public_read_server_settings" on public.server_settings for select using (true);
drop policy if exists "public_read_market" on public.market_items;
create policy "public_read_market" on public.market_items for select using (true);
