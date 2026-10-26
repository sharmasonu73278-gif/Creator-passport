-- Creator Resource Passport: database schema
-- Run this whole file once in the Supabase dashboard -> SQL Editor.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  handle        text not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name  text,
  bio           text,
  avatar_url    text,
  instagram_url text,
  youtube_url   text,
  website_url   text,
  created_at    timestamptz not null default now()
);

create table if not exists public.collections (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 140),
  slug         text not null,
  description  text,
  source_url   text,            -- link to the original reel / video
  category     text,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (creator_id, slug)
);

create table if not exists public.resources (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 140),
  url           text not null check (url ~* '^https?://'),
  description   text,
  kind          text not null default 'website'
                check (kind in ('github','tool','course','template','website','other')),
  pricing       text not null default 'free'
                check (pricing in ('free','freemium','paid')),
  position      int  not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.saves (
  user_id     uuid not null references auth.users (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, resource_id)
);

create table if not exists public.events (
  id            bigint generated always as identity primary key,
  type          text not null check (type in ('collection_view','resource_click')),
  collection_id uuid references public.collections (id) on delete cascade,
  resource_id   uuid references public.resources (id) on delete cascade,
  created_at    timestamptz not null default now()
);

create index if not exists collections_creator_idx on public.collections (creator_id);
create index if not exists resources_collection_idx on public.resources (collection_id, position);
create index if not exists saves_user_idx on public.saves (user_id, created_at desc);
create index if not exists events_collection_idx on public.events (collection_id, created_at);
create index if not exists events_resource_idx on public.events (resource_id, created_at);

-- ---------------------------------------------------------------- triggers

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-zA-Z0-9]', '', 'g'));
  if char_length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 22);
  candidate := base || substr(md5(random()::text), 1, 4);
  insert into public.profiles (id, handle, display_name)
  values (new.id, candidate, base);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists collections_touch on public.collections;
create trigger collections_touch
  before update on public.collections
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- row level security

alter table public.profiles    enable row level security;
alter table public.collections enable row level security;
alter table public.resources   enable row level security;
alter table public.saves       enable row level security;
alter table public.events      enable row level security;

-- profiles: public read, owner update
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles
  for select using (true);

drop policy if exists "owner updates profile" on public.profiles;
create policy "owner updates profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- collections: published ones are public, owner has full access
drop policy if exists "published collections are public" on public.collections;
create policy "published collections are public" on public.collections
  for select using (is_published or auth.uid() = creator_id);

drop policy if exists "owner inserts collections" on public.collections;
create policy "owner inserts collections" on public.collections
  for insert with check (auth.uid() = creator_id);

drop policy if exists "owner updates collections" on public.collections;
create policy "owner updates collections" on public.collections
  for update using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

drop policy if exists "owner deletes collections" on public.collections;
create policy "owner deletes collections" on public.collections
  for delete using (auth.uid() = creator_id);

-- resources: readable when the parent collection is readable, owner manages
drop policy if exists "resources follow collection visibility" on public.resources;
create policy "resources follow collection visibility" on public.resources
  for select using (
    exists (
      select 1 from public.collections c
      where c.id = resources.collection_id
        and (c.is_published or c.creator_id = auth.uid())
    )
  );

drop policy if exists "owner manages resources" on public.resources;
create policy "owner manages resources" on public.resources
  for all using (
    exists (select 1 from public.collections c
            where c.id = resources.collection_id and c.creator_id = auth.uid())
  ) with check (
    exists (select 1 from public.collections c
            where c.id = resources.collection_id and c.creator_id = auth.uid())
  );

-- saves: strictly private to the user
drop policy if exists "users read own saves" on public.saves;
create policy "users read own saves" on public.saves
  for select using (auth.uid() = user_id);

drop policy if exists "users insert own saves" on public.saves;
create policy "users insert own saves" on public.saves
  for insert with check (auth.uid() = user_id);

drop policy if exists "users delete own saves" on public.saves;
create policy "users delete own saves" on public.saves
  for delete using (auth.uid() = user_id);

-- events: anyone may record an event for a published collection; creators read their own
drop policy if exists "anyone records events" on public.events;
create policy "anyone records events" on public.events
  for insert with check (
    exists (select 1 from public.collections c
            where c.id = events.collection_id and c.is_published)
  );

drop policy if exists "creators read own events" on public.events;
create policy "creators read own events" on public.events
  for select using (
    exists (select 1 from public.collections c
            where c.id = events.collection_id and c.creator_id = auth.uid())
  );

-- ---------------------------------------------------------------- analytics

-- Per-resource stats for the signed-in creator. Saves are private per user,
-- so the creator only ever sees an aggregate count, never who saved.
create or replace function public.creator_resource_stats()
returns table (
  collection_id uuid,
  resource_id   uuid,
  clicks        bigint,
  saves         bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select r.collection_id,
         r.id,
         (select count(*) from public.events e
           where e.resource_id = r.id and e.type = 'resource_click'),
         (select count(*) from public.saves s where s.resource_id = r.id)
  from public.resources r
  join public.collections c on c.id = r.collection_id
  where c.creator_id = auth.uid();
$$;

revoke all on function public.creator_resource_stats() from public, anon;
grant execute on function public.creator_resource_stats() to authenticated;

-- Daily views and clicks for the last 30 days, for the signed-in creator.
create or replace function public.creator_daily_stats()
returns table (
  day    date,
  views  bigint,
  clicks bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select d::date as day,
         count(e.*) filter (where e.type = 'collection_view')  as views,
         count(e.*) filter (where e.type = 'resource_click')   as clicks
  from generate_series(current_date - 29, current_date, interval '1 day') d
  left join (
    select ev.* from public.events ev
    join public.collections c on c.id = ev.collection_id
    where c.creator_id = auth.uid()
  ) e on e.created_at::date = d::date
  group by d
  order by d;
$$;

revoke all on function public.creator_daily_stats() from public, anon;
grant execute on function public.creator_daily_stats() to authenticated;
