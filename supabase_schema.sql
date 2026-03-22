-- =============================================
-- أتوبيس كومبليت - Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- 1. Rooms
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id text not null,
  status text default 'waiting' check (status in ('waiting','playing','results','finished')),
  settings jsonb not null default '{}',
  current_round int default 0,
  current_letter text,
  round_started_at timestamptz,
  bus_pressed_by text,
  created_at timestamptz default now()
);

-- 2. Players
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  name text not null,
  session_id text not null,
  score int default 0,
  status text default 'waiting' check (status in ('waiting','typing','done','pressed_bus')),
  is_host boolean default false,
  joined_at timestamptz default now()
);

-- 3. Rounds
create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  round_number int not null,
  letter text not null,
  started_at timestamptz,
  ended_at timestamptz,
  bus_pressed_by text
);

-- 4. Answers
create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  category text not null,
  value text default '',
  status text default 'pending' check (status in ('pending','valid','invalid','duplicate','suspicious')),
  points int default 0,
  validated_at timestamptz,
  unique (round_id, player_id, category)
);

-- =============================================
-- Enable Realtime
-- =============================================
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table answers;

-- =============================================
-- Row Level Security (for public game access)
-- Allow all for now (tighten in production)
-- =============================================
alter table rooms enable row level security;
alter table players enable row level security;
alter table rounds enable row level security;
alter table answers enable row level security;

create policy "allow all rooms" on rooms for all using (true) with check (true);
create policy "allow all players" on players for all using (true) with check (true);
create policy "allow all rounds" on rounds for all using (true) with check (true);
create policy "allow all answers" on answers for all using (true) with check (true);

-- =============================================
-- Auto-cleanup old rooms (optional)
-- =============================================
-- You can set up a cron job to delete rooms older than 24 hours:
-- delete from rooms where created_at < now() - interval '24 hours';
