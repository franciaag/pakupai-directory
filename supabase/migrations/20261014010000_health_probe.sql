BEGIN;
CREATE FUNCTION public.pakupai_health_v1() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object('ok',
  (SELECT count(*)=10 AND bool_and(c.relrowsecurity)
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('pakupai_profiles','pakupai_watchlist','pakupai_workspaces','pakupai_room_agents','pakupai_room_messages','pakupai_library_files','pakupai_library_versions','pakupai_library_bundles','pakupai_library_bundle_files','pakupai_room_bundles'))
  AND has_table_privilege('authenticated','public.pakupai_profiles','SELECT')
  AND NOT has_table_privilege('anon','public.pakupai_profiles','SELECT')
  AND has_function_privilege('service_role','public.pakupai_workspace_rpc(text,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.pakupai_bridge_rpc(text,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.pakupai_manual_rpc(text,jsonb)','EXECUTE')
  AND (SELECT count(*)>=0 FROM (SELECT 1 FROM public.pakupai_profiles LIMIT 1) p)
 );
$$;
REVOKE ALL ON FUNCTION public.pakupai_health_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pakupai_health_v1() TO service_role;
COMMIT;
