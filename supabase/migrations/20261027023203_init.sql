-- Ironlog: one person's data per row, enforced by row-level security.
--
-- Who someone is comes from Clerk. Supabase verifies the Clerk session token
-- (third-party auth) and exposes its claims through auth.jwt(); 'sub' is the
-- Clerk user id, e.g. 'user_2abc...'. Every policy below compares a row's
-- user_id with that claim, so the database itself refuses other people's rows,
-- whatever the app code asks for.
--
-- user_id defaults to the caller's id, so the app never sends it, and a
-- request that tries to set someone else's id fails the insert/update check.

create or replace function public.requesting_user_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

-- profiles: one row per person ------------------------------------------------
create table public.profiles (
  user_id    text primary key default public.requesting_user_id(),
  look_id    text not null check (look_id in ('broad-muscular', 'legs-glutes', 'lean-athletic', 'toned-defined', 'big-strong', 'balanced')),
  time       text not null check (time in ('short', 'standard', 'long')),
  unit       text not null check (unit in ('kg', 'lb')),
  weights    jsonb not null default '{}'::jsonb check (jsonb_typeof(weights) = 'object'),
  nutrition  jsonb check (nutrition is null or jsonb_typeof(nutrition) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- workouts: one row per finished workout --------------------------------------
create table public.workouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null default public.requesting_user_id(),
  date       date not null,
  key        text not null check (key in ('A', 'B', 'C')),
  unit       text not null check (unit in ('kg', 'lb')),
  note       text not null default '' check (char_length(note) <= 1000),
  exercises  jsonb not null check (jsonb_typeof(exercises) = 'array'),
  created_at timestamptz not null default now()
);
create index workouts_user_date on public.workouts (user_id, date desc);

-- checkins: one row per monthly check-in ---------------------------------------
create table public.checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null default public.requesting_user_id(),
  date       date not null,
  answers    jsonb not null check (jsonb_typeof(answers) = 'object'),
  created_at timestamptz not null default now()
);
create index checkins_user_date on public.checkins (user_id, date desc);

-- saved_exercises: exercises saved from the wger library -----------------------
create table public.saved_exercises (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null default public.requesting_user_id(),
  wger_id    integer not null check (wger_id > 0),
  name       text not null check (char_length(name) between 1 and 200),
  muscles    text[] not null default '{}',
  equipment  text[] not null default '{}',
  image_url  text check (image_url is null or image_url like 'https://wger.de/%'),
  note       text not null default '' check (char_length(note) <= 280),
  saved_at   timestamptz not null default now(),
  unique (user_id, wger_id)
);

-- Row-level security: on for every table, one policy per action ----------------
-- (select ...) lets Postgres evaluate the caller's id once per query, not per row.
do $$
declare t text;
begin
  foreach t in array array['profiles', 'workouts', 'checkins', 'saved_exercises'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy "read own rows" on public.%I for select to authenticated
      using (user_id = (select public.requesting_user_id()))$p$, t);
    execute format($p$create policy "add own rows" on public.%I for insert to authenticated
      with check (user_id = (select public.requesting_user_id()))$p$, t);
    execute format($p$create policy "change own rows" on public.%I for update to authenticated
      using (user_id = (select public.requesting_user_id()))
      with check (user_id = (select public.requesting_user_id()))$p$, t);
    execute format($p$create policy "delete own rows" on public.%I for delete to authenticated
      using (user_id = (select public.requesting_user_id()))$p$, t);
  end loop;
end
$$;
