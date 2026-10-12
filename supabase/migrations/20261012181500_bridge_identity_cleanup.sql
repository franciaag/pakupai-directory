begin;
-- Runs while the mapping still exists, including owner/workspace cascades.
-- Both server-side mapping and immutable Auth app metadata must agree.
create function pakupai.bridge_delete_identity() returns trigger
language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 select i.auth_user_id into u from pakupai.bridge_identities i where i.agent_id=old.id;
 if u is not null then
  delete from auth.users a where a.id=u
   and a.raw_app_meta_data->>'pakupai_bridge_agent'=old.id::text
   and a.email like 'bridge-%@bridge.pakupai.invalid'
   and not exists(select 1 from public.pakupai_workspaces w where w.owner_id=a.id);
 end if;
 return old;
end$$;
revoke all on function pakupai.bridge_delete_identity() from public,anon,authenticated;
create trigger bridge_delete_identity before delete on public.pakupai_room_agents
for each row execute function pakupai.bridge_delete_identity();
commit;
