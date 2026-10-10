-- Additive anonymous charter artwork. No names, account IDs or network identifiers on signatures.
begin;
create table public.charter_signatures (
 id uuid primary key default gen_random_uuid(),
 client_submission_id uuid not null unique,
 strokes jsonb not null,
 region_id text not null check (region_id in ('orange','red','green','blue','navy','teal')),
 status text not null default 'pending' check (status in ('pending','approved','rejected','hidden')),
 charter_version text not null check (charter_version = '2026-10-10'),
 point_count integer not null check (point_count between 2 and 1600),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references public.profiles(id) on delete set null
);
create index charter_signatures_status_created on public.charter_signatures(status, created_at desc);
create index charter_signatures_region_status_created on public.charter_signatures(region_id, status, created_at desc);
create table public.charter_settings (
 singleton boolean primary key default true check (singleton),
 submissions_enabled boolean not null default true,
 auto_approve boolean not null default false,
 -- Reuse the existing trusted Worker submission gateway; only its digest is stored.
 gateway_digest bytea not null default decode('a035c2562f47d5a1d12a04a8dc7ed76f1d516da2ba2e8634ca0981a8bfdb8bbb','hex')
);
insert into public.charter_settings(singleton) values(true);
create table public.charter_moderation_audit (
 id bigint generated always as identity primary key,
 signature_id uuid not null references public.charter_signatures(id),
 actor_id uuid not null references public.profiles(id),
 from_status text not null,
 to_status text not null,
 created_at timestamptz not null default now()
);
-- Short-lived anonymous session/burst HMAC buckets; never raw IPs or user agents.
create table public.charter_rate_limits (
 bucket text primary key,
 window_started_at timestamptz not null default now(),
 submissions integer not null default 1
);
alter table public.charter_signatures enable row level security;
alter table public.charter_settings enable row level security;
alter table public.charter_moderation_audit enable row level security;
alter table public.charter_rate_limits enable row level security;
revoke all on public.charter_signatures, public.charter_settings, public.charter_moderation_audit, public.charter_rate_limits from public, anon, authenticated;
grant select(id, strokes, region_id, created_at) on public.charter_signatures to anon, authenticated;
create policy charter_public_approved on public.charter_signatures for select to anon, authenticated using(status='approved');

create function public.charter_validate_strokes(p_strokes jsonb) returns integer
language plpgsql immutable set search_path='' as $$
declare s jsonb; p jsonb; v jsonb; previous jsonb; total integer:=0; distance double precision:=0;
begin
 if p_strokes is null or jsonb_typeof(p_strokes)<>'array' or octet_length(p_strokes::text)>65536 then
  raise exception 'invalid strokes' using errcode='22023'; end if;
 if jsonb_array_length(p_strokes) not between 1 and 32 then raise exception 'invalid stroke count' using errcode='22023'; end if;
 for s in select value from jsonb_array_elements(p_strokes) loop
  if jsonb_typeof(s)<>'array' then raise exception 'invalid stroke' using errcode='22023'; end if;
  if jsonb_array_length(s)<2 then raise exception 'short stroke' using errcode='22023'; end if;
  total:=total+jsonb_array_length(s); previous:=null;
  if total>1600 then raise exception 'too many points' using errcode='22023'; end if;
  for p in select value from jsonb_array_elements(s) loop
   if jsonb_typeof(p)<>'array' then raise exception 'invalid point' using errcode='22023'; end if;
   if jsonb_array_length(p) not between 2 and 3 then raise exception 'invalid point' using errcode='22023'; end if;
   for v in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v)<>'number' then raise exception 'invalid coordinate' using errcode='22023'; end if;
    if v::numeric<0 or v::numeric>1 then raise exception 'invalid coordinate' using errcode='22023'; end if;
   end loop;
   if previous is not null then distance:=distance+sqrt(power((p->>0)::double precision-(previous->>0)::double precision,2)+power((p->>1)::double precision-(previous->>1)::double precision,2)); end if;
   previous:=p;
  end loop;
 end loop;
 if distance<0.35 then raise exception 'signature too short' using errcode='22023'; end if;
 return total;
end $$;

create function public.submit_charter_signature(p_gateway_secret text, p_session_hash text, p_burst_hash text, p_client_submission_id uuid, p_strokes jsonb, p_charter_version text)
returns table(id uuid, region_id text, created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare settings public.charter_settings%rowtype; existing public.charter_signatures%rowtype; n integer; chosen text; bucket_key text; allowed integer; used integer;
begin
 -- Serializes colour allocation and rate checks across Worker instances.
 select * into settings from public.charter_settings where singleton for update;
 if p_gateway_secret is null or extensions.digest(p_gateway_secret,'sha256')<>settings.gateway_digest then raise exception 'gateway denied' using errcode='42501'; end if;
 if p_client_submission_id is null or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' or p_burst_hash is null or p_burst_hash !~ '^[0-9a-f]{64}$' or p_charter_version is distinct from '2026-10-10' then raise exception 'invalid submission' using errcode='22023'; end if;
 n:=public.charter_validate_strokes(p_strokes);
 select * into existing from public.charter_signatures s where s.client_submission_id=p_client_submission_id;
 if found then
  if existing.strokes<>p_strokes then raise exception 'submission key already used' using errcode='22023'; end if;
  return query select existing.id,existing.region_id,existing.created_at; return;
 end if;
 if not settings.submissions_enabled then raise exception 'submissions disabled' using errcode='P0001'; end if;
 foreach bucket_key in array array['session:'||p_session_hash,'burst:'||p_burst_hash] loop
  allowed:=case when bucket_key like 'session:%' then 3 else 1000 end;
  insert into public.charter_rate_limits as r(bucket) values(bucket_key)
  on conflict(bucket) do update set
   submissions=case when r.window_started_at<now()-interval '10 minutes' then 1 else r.submissions+1 end,
   window_started_at=case when r.window_started_at<now()-interval '10 minutes' then now() else r.window_started_at end
  returning submissions into used;
  if used>allowed then raise exception 'please wait before submitting again' using errcode='P0001'; end if;
 end loop;
 -- Exponential race: capacity / (occupancy + capacity) weights avoid crowding a region.
 select regions.region into chosen from
 (values ('orange',1.0),('red',1.0),('green',1.0),('blue',1.0),('navy',1.0),('teal',1.0)) regions(region,capacity)
 left join lateral (select count(*) as n from public.charter_signatures s where s.region_id=regions.region and s.status in ('approved','pending')) occupancy on true
 order by -ln(greatest(random(),0.000000001))/(regions.capacity/(occupancy.n+regions.capacity*100)) limit 1;
 insert into public.charter_signatures(client_submission_id,strokes,region_id,status,charter_version,point_count)
 values(p_client_submission_id,p_strokes,chosen,case when settings.auto_approve then 'approved' else 'pending' end,p_charter_version,n)
 returning * into existing;
 return query select existing.id,existing.region_id,existing.created_at;
end $$;

-- Public manifest is bounded and contains only safe fields; clients fetch strokes only for new IDs.
create function public.charter_public_manifest(p_per_region integer default 164)
returns table(id uuid, region_id text, created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select sample.id,sample.region_id,sample.created_at
 from unnest(array['orange','red','green','blue','navy','teal']) r(region)
 cross join lateral (select s.id,s.region_id,s.created_at from public.charter_signatures s
 where s.status='approved' and s.region_id=r.region order by s.created_at desc,s.id limit greatest(1,least(coalesce(p_per_region,164),164))) sample
$$;
create function public.charter_moderation_queue(p_status text default 'pending', p_before timestamptz default null)
returns table(id uuid, strokes jsonb, region_id text, created_at timestamptz, status text)
language plpgsql stable security definer set search_path='' as $$
begin
 if public.current_app_role() is null or public.current_app_role() not in ('swag_member','teacher') then raise exception 'staff required' using errcode='42501'; end if;
 if p_status not in ('pending','approved') or p_status is null then raise exception 'invalid queue' using errcode='22023'; end if;
 return query select s.id,s.strokes,s.region_id,s.created_at,s.status from public.charter_signatures s
 where s.status=p_status and (p_before is null or s.created_at<p_before) order by s.created_at desc,s.id limit 40;
end $$;
create function public.moderate_charter_signature(p_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor public.app_role:=public.current_app_role(); previous text;
begin
 if auth.uid() is null or actor is null or actor not in ('swag_member','teacher') or (p_status='hidden' and actor<>'teacher') then raise exception 'staff required' using errcode='42501'; end if;
 if p_status is null or p_status not in ('approved','rejected','hidden') then raise exception 'invalid action' using errcode='22023'; end if;
 select status into previous from public.charter_signatures where id=p_id for update;
 if not found then return false; end if;
 if previous=p_status then return true; end if;
 if not ((previous='pending' and p_status in ('approved','rejected')) or (previous='approved' and p_status='hidden')) then raise exception 'signature already reviewed; refresh queue' using errcode='40001'; end if;
 update public.charter_signatures set status=p_status,reviewed_at=now(),reviewed_by=auth.uid() where id=p_id;
 insert into public.charter_moderation_audit(signature_id,actor_id,from_status,to_status) values(p_id,auth.uid(),previous,p_status);
 return true;
end $$;
revoke all on function public.charter_validate_strokes(jsonb) from public,anon,authenticated;
revoke all on function public.submit_charter_signature(text,text,text,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.charter_public_manifest(integer) from public,anon,authenticated;
revoke all on function public.charter_moderation_queue(text,timestamptz) from public,anon,authenticated;
revoke all on function public.moderate_charter_signature(uuid,text) from public,anon,authenticated;
grant execute on function public.submit_charter_signature(text,text,text,uuid,jsonb,text) to anon;
grant execute on function public.charter_public_manifest(integer) to anon,authenticated;
grant execute on function public.charter_moderation_queue(text,timestamptz),public.moderate_charter_signature(uuid,text) to authenticated;
commit;
