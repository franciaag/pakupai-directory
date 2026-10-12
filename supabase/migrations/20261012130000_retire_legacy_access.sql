begin;
-- User-approved retirement and erasure of the old workspace. Profile tables are untouched.
truncate pakupai.bundle_files,pakupai.files,pakupai.versions,pakupai.bundles,pakupai.room_bundles,pakupai.library_agents,pakupai.library_links,pakupai.agents,pakupai.invites,pakupai.events,pakupai.login_attempts,pakupai.room_config,pakupai.legacy_profile_links;
revoke execute on function public.pakupai_rpc(text,jsonb) from service_role;
revoke execute on function public.pakupai_legacy_profile(text,uuid) from service_role;
commit;
