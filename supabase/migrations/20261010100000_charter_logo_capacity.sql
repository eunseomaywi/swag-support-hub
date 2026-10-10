-- Capacities measured from the approved six canonical logo paths.
-- Retains existing grants, RLS and the submission contract.
begin;
create or replace function public.submit_charter_signature(p_gateway_secret text, p_session_hash text, p_burst_hash text, p_client_submission_id uuid, p_strokes jsonb, p_charter_version text)
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
 -- Exponential race: capacity / (1 + occupancy / target capacity) weights avoid crowding a region.
 select regions.region into chosen from
 (values ('orange',1089.0/19261),('red',1680.0/19261),('green',1867.0/19261),('blue',1596.0/19261),('navy',12049.0/19261),('teal',980.0/19261)) regions(region,capacity)
 left join lateral (select count(*) as n from public.charter_signatures s where s.region_id=regions.region and s.status in ('approved','pending')) occupancy on true
 order by -ln(greatest(random(),0.000000001))/(regions.capacity/(1+occupancy.n/(regions.capacity*100))) limit 1;
 insert into public.charter_signatures(client_submission_id,strokes,region_id,status,charter_version,point_count)
 values(p_client_submission_id,p_strokes,chosen,case when settings.auto_approve then 'approved' else 'pending' end,p_charter_version,n)
 returning * into existing;
 return query select existing.id,existing.region_id,existing.created_at;
end $$;

create or replace function public.charter_public_manifest(p_per_region integer default 164)
returns table(id uuid, region_id text, created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select sample.id,sample.region_id,sample.created_at
 from (values ('orange',1089),('red',1680),('green',1867),('blue',1596),('navy',12049),('teal',980)) r(region,area)
 cross join lateral (select s.id,s.region_id,s.created_at from public.charter_signatures s
 where s.status='approved' and s.region_id=r.region order by s.created_at desc,s.id
 limit greatest(1,ceil(least(980,greatest(6,coalesce(p_per_region,164)*6))*r.area/19261.0)::integer)) sample
$$;
commit;
