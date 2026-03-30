-- ============================================================
--  operator_assignments  –  Supabase migration
--  Run this in your Supabase SQL editor
-- ============================================================

-- 1. Operators table (stores PIN-authenticated users)
create table if not exists public.operators (
  id          text primary key,
  name        text not null,
  pin         text not null,          -- store hashed in production!
  role        text not null default 'operator'  check (role in ('operator','manager')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Seed some default operators (change PINs before going live!)
insert into public.operators (id, name, pin, role) values
  ('op1',  'Alex R.',    '1111', 'operator'),
  ('op2',  'Jordan M.',  '2222', 'operator'),
  ('op3',  'Casey T.',   '3333', 'operator'),
  ('mgr1', 'Manager',    '9999', 'manager')
on conflict (id) do nothing;

-- 2. Load-assignment queue
create table if not exists public.operator_assignments (
  id              text primary key,
  operator_id     text not null references public.operators(id),
  check_in_id     uuid not null references public.check_ins(id),
  queue_position  integer not null default 1,
  assigned_at     timestamptz not null default now(),
  assigned_by     text not null,
  status          text not null default 'queued'
                    check (status in ('queued','in_progress','completed')),
  started_at      timestamptz,
  completed_at    timestamptz
);

-- Index for fast operator-queue lookups
create index if not exists idx_op_assignments_operator
  on public.operator_assignments (operator_id, status, queue_position);

-- 3. Enable Row Level Security (optional but recommended)
alter table public.operators            enable row level security;
alter table public.operator_assignments enable row level security;

-- Allow anon/authenticated reads (tighten this per your auth setup)
create policy "Public read operators"
  on public.operators for select using (true);

create policy "Public read assignments"
  on public.operator_assignments for select using (true);

create policy "Public insert assignments"
  on public.operator_assignments for insert with check (true);

create policy "Public update assignments"
  on public.operator_assignments for update using (true);

create policy "Public delete assignments"
  on public.operator_assignments for delete using (true);

-- 4. Realtime — enable for both tables
-- In your Supabase dashboard → Database → Replication → add both tables,
-- OR run:
-- alter publication supabase_realtime add table public.operator_assignments;
-- alter publication supabase_realtime add table public.operators;
