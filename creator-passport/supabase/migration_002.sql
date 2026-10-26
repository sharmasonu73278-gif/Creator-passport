-- Creator Resource Passport: migration 002 (v2 platform features)
-- Run AFTER schema.sql, once, in the Supabase SQL Editor. Safe to re-run.
--
-- Adds: Instagram connection + verified reels, moderation, reports, search, creator ranking,
-- plans and save limit, feedback, PDF guides, storage buckets.
--
-- Security model: content moderation cannot be bypassed from the browser. Rows written by a
-- signed-in user always start as 'pending' and become public only after the server has checked
-- them (or an admin approves them). Profiles and moderation fields can only be changed by the
-- server (service role key), never directly by a user's own session.

create extension if not exists pg_trgm with schema extensions;

-- ======================================================================== profiles

alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_banned boolean not null default false,
  add column if not exists plan text not null default 'free',
  add column if not exists instagram_user_id text unique,
  add column if not exists instagram_username text,
  add column if not exists instagram_connected_at timestamptz;

-- From now on profiles are written only by the server (service role). This stops a user from
-- making themselves admin, changing their plan, or faking an Instagram link from the browser.
revoke insert, update, delete on public.profiles from anon, authenticated;

-- ======================================================================== plans and save limit

create table if not exists public.plans (
  name       text primary key,
  save_limit int  not null check (save_limit > 0)
);

insert into public.plans (name, save_limit) values ('free', 25), ('pro', 500)
on conflict (name) do nothing;

alter table public.plans enable row level security;
drop policy if exists "plans are public" on public.plans;
create policy "plans are public" on public.plans for select using (true);

create or replace function public.enforce_save_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_saves int;
  used int;
begin
  select pl.save_limit into max_saves
  from public.profiles p join public.plans pl on pl.name = p.plan
  where p.id = new.user_id;

  if max_saves is null then
    max_saves := 25;
  end if;

  select count(*) into used from public.saves where user_id = new.user_id;
  if used >= max_saves then
    raise exception 'SAVE_LIMIT_REACHED';
  end if;
  return new;
end;
$$;

drop trigger if exists saves_limit on public.saves;
create trigger saves_limit
  before insert on public.saves
  for each row execute function public.enforce_save_limit();

-- ======================================================================== Instagram

-- Tokens live here. RLS is on with NO policies, so only the server (service role) can touch it.
create table if not exists public.instagram_connections (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  ig_user_id       text not null unique,
  username         text,
  token_enc        text not null,
  token_expires_at timestamptz not null,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now()
);
alter table public.instagram_connections enable row level security;

-- Reels that belong to a connected account, as reported by Instagram itself.
create table if not exists public.instagram_reels (
  ig_media_id   text primary key,
  creator_id    uuid not null references public.profiles (id) on delete cascade,
  shortcode     text not null,
  permalink     text not null,
  caption       text,
  thumbnail_url text,
  posted_at     timestamptz,
  synced_at     timestamptz not null default now()
);
create index if not exists instagram_reels_creator_idx on public.instagram_reels (creator_id, posted_at desc);
alter table public.instagram_reels enable row level security;

drop policy if exists "creators read own reels" on public.instagram_reels;
create policy "creators read own reels" on public.instagram_reels
  for select using (auth.uid() = creator_id);

-- Meta data-deletion requests (required by Meta for apps that use Instagram data).
create table if not exists public.deletion_requests (
  code       text primary key,
  ig_user_id text not null,
  status     text not null default 'completed',
  created_at timestamptz not null default now()
);
alter table public.deletion_requests enable row level security;

-- ======================================================================== collections

alter table public.collections
  add column if not exists ig_media_id text,
  add column if not exists ig_shortcode text,
  add column if not exists ig_permalink text,
  add column if not exists moderation_status text not null default 'approved'
    check (moderation_status in ('approved', 'pending', 'rejected')),
  add column if not exists moderation_note text;

-- Existing rows keep 'approved'; every NEW row starts as 'pending' until checked.
alter table public.collections alter column moderation_status set default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'collections_ig_media_fk') then
    alter table public.collections
      add constraint collections_ig_media_fk
      foreign key (ig_media_id) references public.instagram_reels (ig_media_id) on delete set null;
  end if;
end $$;

create unique index if not exists collections_ig_media_uidx on public.collections (ig_media_id) where ig_media_id is not null;
create index if not exists collections_shortcode_idx on public.collections (ig_shortcode);

create or replace function public.collections_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reel record;
begin
  -- A collection may only point at a reel that belongs to the same creator.
  if new.ig_media_id is not null then
    select * into reel from public.instagram_reels
    where ig_media_id = new.ig_media_id and creator_id = new.creator_id;
    if not found then
      raise exception 'REEL_NOT_OWNED';
    end if;
    new.ig_shortcode := reel.shortcode;
    new.ig_permalink := reel.permalink;
    new.source_url   := reel.permalink;
  else
    new.ig_shortcode := null;
    new.ig_permalink := null;
  end if;

  -- Publishing requires a verified reel.
  if new.ig_media_id is null and new.is_published then
    if tg_op = 'INSERT' then
      raise exception 'REEL_REQUIRED';
    elsif old.is_published is distinct from new.is_published then
      raise exception 'REEL_REQUIRED';
    else
      new.is_published := false; -- reel link was removed, take the page offline
    end if;
  end if;

  -- Anything written from a user's own session needs (re)checking by the server.
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.moderation_status := 'pending';
    elsif (new.title, new.description, new.category, new.ig_media_id)
          is distinct from (old.title, old.description, old.category, old.ig_media_id) then
      new.moderation_status := 'pending';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists collections_guard_trg on public.collections;
create trigger collections_guard_trg
  before insert or update on public.collections
  for each row execute function public.collections_guard();

-- Users may only write these columns. Moderation and Instagram fields are server-controlled.
revoke insert, update on public.collections from anon, authenticated;
grant insert (creator_id, title, slug, description, source_url, category, ig_media_id)
  on public.collections to authenticated;
grant update (title, description, source_url, category, ig_media_id, is_published)
  on public.collections to authenticated;

-- ======================================================================== resources

alter table public.resources
  add column if not exists moderation_status text not null default 'approved'
    check (moderation_status in ('approved', 'pending', 'rejected')),
  add column if not exists moderation_note text,
  add column if not exists guide_path text,
  add column if not exists guide_name text,
  add column if not exists guide_approved boolean not null default false,
  add column if not exists search_tsv tsvector
    generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))) stored;

alter table public.resources alter column moderation_status set default 'pending';

create index if not exists resources_search_idx on public.resources using gin (search_tsv);

create or replace function public.resources_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  col_owner uuid;
  n int;
begin
  select creator_id into col_owner from public.collections where id = new.collection_id;

  if tg_op = 'INSERT' then
    select count(*) into n from public.resources where collection_id = new.collection_id;
    if n >= 30 then
      raise exception 'RESOURCE_LIMIT';
    end if;
  end if;

  -- A guide file must live in the creator's own storage folder.
  if new.guide_path is not null and split_part(new.guide_path, '/', 1) <> col_owner::text then
    raise exception 'INVALID_GUIDE_PATH';
  end if;

  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.moderation_status := 'pending';
      new.guide_approved := false;
    else
      if (new.title, new.url, new.description)
         is distinct from (old.title, old.url, old.description) then
        new.moderation_status := 'pending';
      end if;
      -- A new or replaced PDF is reviewed separately, so the resource itself stays visible.
      if new.guide_path is distinct from old.guide_path then
        new.guide_approved := false;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists resources_guard_trg on public.resources;
create trigger resources_guard_trg
  before insert or update on public.resources
  for each row execute function public.resources_guard();

revoke insert, update on public.resources from anon, authenticated;
grant insert (collection_id, title, url, description, kind, pricing, position, guide_path, guide_name)
  on public.resources to authenticated;
grant update (title, url, description, kind, pricing, position, guide_path, guide_name)
  on public.resources to authenticated;

-- ======================================================================== visibility policies

create or replace function public.is_visible_creator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not coalesce((select is_banned from public.profiles where id = uid), true);
$$;

drop policy if exists "published collections are public" on public.collections;
create policy "published collections are public" on public.collections
  for select using (
    (is_published and moderation_status = 'approved' and public.is_visible_creator(creator_id))
    or auth.uid() = creator_id
  );

drop policy if exists "resources follow collection visibility" on public.resources;
create policy "resources follow collection visibility" on public.resources
  for select using (
    exists (
      select 1 from public.collections c
      where c.id = resources.collection_id
        and (
          (c.is_published and c.moderation_status = 'approved'
            and resources.moderation_status = 'approved'
            and public.is_visible_creator(c.creator_id))
          or c.creator_id = auth.uid()
        )
    )
  );

-- ======================================================================== events

alter table public.events add column if not exists actor_hash text;
create index if not exists events_actor_idx on public.events (resource_id, actor_hash);

-- Views and clicks are now recorded only by the server (service role), which de-duplicates them.
-- Removing the open insert policy stops anyone inflating a creator's numbers through the API.
drop policy if exists "anyone records events" on public.events;

-- ======================================================================== reports

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  reason      text not null check (reason in ('vulgar', 'scam', 'malware', 'copyright', 'misleading', 'other')),
  details     text check (char_length(details) <= 500),
  status      text not null default 'open' check (status in ('open', 'upheld', 'dismissed')),
  created_at  timestamptz not null default now(),
  unique (reporter_id, resource_id)
);
create index if not exists reports_status_idx on public.reports (status, created_at);
alter table public.reports enable row level security;

drop policy if exists "users file own reports" on public.reports;
create policy "users file own reports" on public.reports
  for insert with check (auth.uid() = reporter_id);

drop policy if exists "users read own reports" on public.reports;
create policy "users read own reports" on public.reports
  for select using (auth.uid() = reporter_id);

create or replace function public.reports_autohide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(distinct reporter_id) from public.reports
      where resource_id = new.resource_id and status = 'open') >= 3 then
    update public.resources
       set moderation_status = 'pending',
           moderation_note = 'Hidden automatically after multiple reports'
     where id = new.resource_id and moderation_status = 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_autohide_trg on public.reports;
create trigger reports_autohide_trg
  after insert on public.reports
  for each row execute function public.reports_autohide();

-- ======================================================================== feedback

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  worked      boolean,
  comment     text check (char_length(comment) <= 500),
  created_at  timestamptz not null default now(),
  unique (user_id, resource_id)
);
create index if not exists feedback_resource_idx on public.feedback (resource_id);
alter table public.feedback enable row level security;

-- Only people who saved a resource can rate it.
drop policy if exists "savers write feedback" on public.feedback;
create policy "savers write feedback" on public.feedback
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.saves s where s.user_id = auth.uid() and s.resource_id = feedback.resource_id)
  );

drop policy if exists "users update own feedback" on public.feedback;
create policy "users update own feedback" on public.feedback
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users read own feedback" on public.feedback;
create policy "users read own feedback" on public.feedback
  for select using (auth.uid() = user_id);

create or replace function public.rating_avg(rid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(avg(rating)::numeric, 1) from public.feedback where resource_id = rid;
$$;

create or replace function public.rating_count(rid uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.feedback where resource_id = rid;
$$;

-- Ratings for many resources at once (used by collection, search and library pages).
create or replace function public.ratings_for(ids uuid[])
returns table (resource_id uuid, avg_rating numeric, n bigint)
language sql
stable
security definer
set search_path = public
as $$
  select f.resource_id, round(avg(f.rating)::numeric, 1), count(*)
  from public.feedback f
  where f.resource_id = any(ids)
  group by f.resource_id;
$$;

grant execute on function public.ratings_for(uuid[]) to anon, authenticated;

-- Comments on the signed-in creator's own resources (no reviewer identity is exposed).
create or replace function public.creator_feedback()
returns table (
  resource_id    uuid,
  resource_title text,
  rating         smallint,
  worked         boolean,
  comment        text,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.resource_id, r.title, f.rating, f.worked, f.comment, f.created_at
  from public.feedback f
  join public.resources r on r.id = f.resource_id
  join public.collections c on c.id = r.collection_id
  where c.creator_id = auth.uid()
  order by f.created_at desc
  limit 100;
$$;

revoke all on function public.creator_feedback() from public, anon;
grant execute on function public.creator_feedback() to authenticated;

-- ======================================================================== search

create or replace function public.search_resources(
  q            text,
  kind_filter  text default null,
  page_limit   int  default 20,
  page_offset  int  default 0
)
returns table (
  resource_id       uuid,
  title             text,
  description       text,
  kind              text,
  pricing           text,
  has_guide         boolean,
  collection_id     uuid,
  collection_title  text,
  collection_slug   text,
  category          text,
  reel_permalink    text,
  creator_id        uuid,
  handle            text,
  display_name      text,
  avatar_url        text,
  instagram_username text,
  rating            numeric,
  rating_count      bigint,
  relevance         real
)
language sql
stable
set search_path = public, extensions
as $$
  with p as (
    select nullif(trim(q), '') as q,
           websearch_to_tsquery('simple', coalesce(trim(q), '')) as tsq,
           '%' || replace(replace(replace(lower(coalesce(trim(q), '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select r.id, r.title, r.description, r.kind, r.pricing, (r.guide_path is not null and r.guide_approved),
         c.id, c.title, c.slug, c.category, c.ig_permalink,
         pr.id, pr.handle, pr.display_name, pr.avatar_url, pr.instagram_username,
         public.rating_avg(r.id), public.rating_count(r.id),
         (ts_rank(r.search_tsv, p.tsq) + similarity(r.title, p.q) * 0.6)::real
  from p, public.resources r
  join public.collections c on c.id = r.collection_id
  join public.profiles pr on pr.id = c.creator_id
  where p.q is not null
    and c.is_published and c.moderation_status = 'approved'
    and r.moderation_status = 'approved'
    and not pr.is_banned
    and (kind_filter is null or r.kind = kind_filter)
    and (
      r.search_tsv @@ p.tsq
      or similarity(r.title, p.q) > 0.25
      or lower(r.title) like p.pat
      or lower(c.title) like p.pat
      or lower(coalesce(r.description, '')) like p.pat
      or lower(coalesce(pr.display_name, '')) like p.pat
      or lower(pr.handle) like p.pat
    )
  order by 19 desc, r.created_at desc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
$$;

grant execute on function public.search_resources(text, text, int, int) to anon, authenticated;

-- ======================================================================== creator ranking

-- Score rewards what real people do, and ignores what a creator can fake alone:
--   * unique people who clicked (last 90 days), not raw clicks
--   * saves by other people (a creator saving their own resource does not count)
--   * ratings from people who saved, shrunk toward 4.0 until there are enough of them
--   * a penalty for each upheld report
create or replace function public.creator_leaderboard(max_rows int default 50)
returns table (
  rank            bigint,
  creator_id      uuid,
  handle          text,
  display_name    text,
  avatar_url      text,
  instagram_username text,
  score           numeric,
  resources       bigint,
  unique_clicks   bigint,
  saves           bigint,
  rating          numeric,
  rating_count    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select c.creator_id, r.id as resource_id
    from public.resources r
    join public.collections c on c.id = r.collection_id
    where c.is_published and c.moderation_status = 'approved' and r.moderation_status = 'approved'
  ),
  clicks as (
    select res.creator_id, count(distinct e.actor_hash) as n
    from public.events e join res on res.resource_id = e.resource_id
    where e.type = 'resource_click' and e.actor_hash is not null
      and e.created_at > now() - interval '90 days'
    group by res.creator_id
  ),
  sv as (
    select res.creator_id, count(*) as n
    from public.saves s join res on res.resource_id = s.resource_id
    where s.user_id <> res.creator_id
    group by res.creator_id
  ),
  fb as (
    select res.creator_id, count(*) as n, avg(f.rating)::numeric as avg_rating
    from public.feedback f join res on res.resource_id = f.resource_id
    where f.user_id <> res.creator_id
    group by res.creator_id
  ),
  rp as (
    select c.creator_id, count(*) as n
    from public.reports x
    join public.resources r on r.id = x.resource_id
    join public.collections c on c.id = r.collection_id
    where x.status = 'upheld'
    group by c.creator_id
  ),
  base as (
    select p.id, p.handle, p.display_name, p.avatar_url, p.instagram_username,
           (select count(*) from res where res.creator_id = p.id) as resources,
           coalesce(clicks.n, 0) as unique_clicks,
           coalesce(sv.n, 0) as saves,
           coalesce(fb.n, 0) as rating_count,
           ((coalesce(fb.avg_rating, 0) * coalesce(fb.n, 0) + 4.0 * 3) / (coalesce(fb.n, 0) + 3))::numeric as rating,
           coalesce(rp.n, 0) as upheld
    from public.profiles p
    left join clicks on clicks.creator_id = p.id
    left join sv on sv.creator_id = p.id
    left join fb on fb.creator_id = p.id
    left join rp on rp.creator_id = p.id
    where not p.is_banned
  ),
  scored as (
    select b.*,
           round((12 * ln(1 + b.unique_clicks)
                + 20 * ln(1 + b.saves)
                + 15 * (b.rating - 3) * ln(1 + b.rating_count)
                - 25 * b.upheld)::numeric, 1) as score
    from base b
    where b.resources > 0
  )
  select row_number() over (order by s.score desc, s.saves desc, s.unique_clicks desc) as rank,
         s.id, s.handle, s.display_name, s.avatar_url, s.instagram_username,
         s.score, s.resources, s.unique_clicks, s.saves, round(s.rating, 1), s.rating_count
  from scored s
  order by rank
  limit least(greatest(max_rows, 1), 500);
$$;

grant execute on function public.creator_leaderboard(int) to anon, authenticated;

-- ======================================================================== storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('guides',  'guides',  false, 10485760, array['application/pdf']),
  ('avatars', 'avatars', true,  2097152,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- PDF guides: a creator may upload, replace and delete files only inside their own folder.
-- Readers never touch the bucket directly; the server hands out short-lived signed links.
drop policy if exists "creators upload own guides" on storage.objects;
create policy "creators upload own guides" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'guides' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "creators update own guides" on storage.objects;
create policy "creators update own guides" on storage.objects
  for update to authenticated
  using (bucket_id = 'guides' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "creators delete own guides" on storage.objects;
create policy "creators delete own guides" on storage.objects
  for delete to authenticated
  using (bucket_id = 'guides' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "creators read own guides" on storage.objects;
create policy "creators read own guides" on storage.objects
  for select to authenticated
  using (bucket_id = 'guides' and (storage.foldername(name))[1] = auth.uid()::text);

-- ======================================================================== make yourself admin
-- After you sign up, run this once with YOUR email (kept commented on purpose):
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
