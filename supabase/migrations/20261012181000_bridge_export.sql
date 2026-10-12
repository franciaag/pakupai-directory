begin;
alter function public.pakupai_profile_export() rename to pakupai_profile_export_setup_base;
create function public.pakupai_profile_export() returns jsonb language sql security invoker set search_path='' as $$
 select public.pakupai_profile_export_setup_base() || jsonb_build_object('schema_version',6,'bridge_signals',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_bridge_signals t),'[]'::jsonb));
$$;
revoke all on function public.pakupai_profile_export() from public,anon;
grant execute on function public.pakupai_profile_export() to authenticated;
commit;
