-- Read-only post-deployment checks. Does not create users, signatures, or moderation events.
do $$
begin
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname in ('charter_signatures','charter_settings','charter_rate_limits','charter_moderation_audit') and c.relrowsecurity)<>4
 then raise exception 'Charter RLS is not enabled'; end if;
 if not exists(select 1 from public.charter_settings where submissions_enabled and not auto_approve)
 then raise exception 'Unexpected production signing defaults'; end if;
 if has_table_privilege('anon','public.charter_signatures','INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','public.charter_signatures','INSERT,UPDATE,DELETE')
 then raise exception 'Browser DML allowed'; end if;
 if has_column_privilege('anon','public.charter_signatures','status','SELECT')
    or has_column_privilege('authenticated','public.charter_signatures','reviewed_by','SELECT')
 then raise exception 'Private columns exposed'; end if;
 if not has_column_privilege('anon','public.charter_signatures','strokes','SELECT')
 then raise exception 'Public safe columns unavailable'; end if;
 if has_function_privilege('anon','public.charter_moderation_queue(text,timestamptz)','EXECUTE')
 then raise exception 'Anonymous moderation allowed'; end if;
 execute 'set local role anon';
 begin
  perform status from public.charter_signatures;
  raise exception 'Private metadata exposed';
 exception when insufficient_privilege then null;
 end;
 begin
  perform * from public.charter_moderation_queue();
  raise exception 'Anonymous queue exposed';
 exception when insufficient_privilege then null;
 end;
end $$;
