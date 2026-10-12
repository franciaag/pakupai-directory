begin;
alter function public.pakupai_profile_export() rename to pakupai_profile_export_base;
create function public.pakupai_profile_export() returns jsonb language sql security invoker set search_path='' as $$
 select public.pakupai_profile_export_base() || jsonb_build_object('schema_version',2,
 'chat_attachments',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_chat_attachments t),'[]'::jsonb),
 'chat_recipients',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_chat_recipients t),'[]'::jsonb),
 'chat_preferences',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_chat_preferences t),'[]'::jsonb));
$$;
revoke all on function public.pakupai_profile_export() from public,anon;
grant execute on function public.pakupai_profile_export() to authenticated;
commit;
