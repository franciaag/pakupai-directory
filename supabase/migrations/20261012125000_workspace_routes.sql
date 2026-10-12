begin;
-- Keep tokens/credentials out of shareable Library text.
create function pakupai.profile_sensitive_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.body ~* '-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|(password|passwd|secret|api[_-]?key|token)[[:space:]]*[:=][[:space:]]*[^[:space:]]{8,}' then
 raise exception 'sensitive_content_not_allowed';end if;
 return new;
end$$;
revoke all on function pakupai.profile_sensitive_guard() from public,anon,authenticated;
create trigger sensitive_guard before insert or update on public.pakupai_library_files for each row execute function pakupai.profile_sensitive_guard();

alter table pakupai.profile_invites add column label text not null default '';
create table pakupai.profile_agent_limits(agent_id uuid primary key references public.pakupai_room_agents(id) on delete cascade,window_start timestamptz not null,count integer not null);
alter table pakupai.profile_agent_limits enable row level security;
revoke all on pakupai.profile_agent_limits from public,anon,authenticated;
create function public.pakupai_workspace_rpc(op text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid;u uuid;a public.pakupai_room_agents;i pakupai.profile_invites;t timestamptz:=clock_timestamp();n integer;res jsonb;
begin
 if op in ('invite','invites','revoke_invite','transition') then
 u:=(args->>'user_id')::uuid;
 select id into w from public.pakupai_workspaces where owner_id=u for update;
 if w is null then return jsonb_build_object('error','workspace_missing');end if;
 if op='invites' then return jsonb_build_object('invites',coalesce((select jsonb_agg(to_jsonb(v)-'token_hash') from pakupai.profile_invites v where workspace_id=w),'[]'::jsonb));end if;
 if op='invite' then
 delete from pakupai.profile_invites where workspace_id=w and (expires_at<t or used_at is not null or revoked_at is not null);
 if (select count(*) from pakupai.profile_invites where workspace_id=w)>=30 then return jsonb_build_object('error','invite_limit');end if;
 insert into pakupai.profile_invites(id,workspace_id,token_hash,expires_at,label) values((args->>'id')::uuid,w,args->>'hash',t+make_interval(hours=>(args->>'hours')::integer),left(args->>'label',60));
 return jsonb_build_object('id',args->>'id','expires_at',t+make_interval(hours=>(args->>'hours')::integer));end if;
 if op='revoke_invite' then update pakupai.profile_invites set revoked_at=t where id=(args->>'id')::uuid and workspace_id=w and used_at is null and revoked_at is null;return jsonb_build_object('ok',found);end if;
 if op='transition' then
 select * into a from public.pakupai_room_agents where id=(args->>'id')::uuid and workspace_id=w for update;
 if not found then return jsonb_build_object('error','not_found');end if;
 if args->>'action'='approve' and a.status='pending' then update public.pakupai_room_agents set status='approved' where id=a.id;
 elsif args->>'action'='decline' and a.status='pending' then update public.pakupai_room_agents set status='declined' where id=a.id;
 elsif args->>'action'='revoke' and a.status in ('approved','pending') then update public.pakupai_room_agents set status='revoked' where id=a.id;
 else return jsonb_build_object('error','invalid_transition');end if;
 return jsonb_build_object('ok',true);end if;
 end if;
 if op='join' then
 select * into i from pakupai.profile_invites where token_hash=args->>'invite_hash' and used_at is null and revoked_at is null and expires_at>t for update;
 if not found then return jsonb_build_object('error','invite_invalid_expired_or_used');end if;
 perform 1 from public.pakupai_workspaces where id=i.workspace_id for update;
 insert into public.pakupai_room_agents(id,workspace_id,name,role) values((args->>'id')::uuid,i.workspace_id,args->>'name',coalesce(args->>'role','')) returning * into a;
 insert into pakupai.profile_agent_credentials values(a.id,args->>'key_hash');
 update pakupai.profile_invites set used_at=t where id=i.id;
 return jsonb_build_object('agent_id',a.id,'status',a.status);end if;
 if op in ('agent_me','agent_post','agent_messages','agent_files') then
 select g.* into a from public.pakupai_room_agents g join pakupai.profile_agent_credentials c on c.agent_id=g.id where c.key_hash=args->>'hash' for update of g;
 if not found then return jsonb_build_object('error','unauthorized');end if;
 if a.status in ('revoked','declined') then return jsonb_build_object('error','revoked');end if;
 if op='agent_me' then return jsonb_build_object('agent_id',a.id,'name',a.name,'status',a.status);end if;
 if a.status<>'approved' then return jsonb_build_object('error','not_approved');end if;
 if op='agent_post' then
 insert into pakupai.profile_agent_limits values(a.id,t,1) on conflict(agent_id) do update set window_start=case when pakupai.profile_agent_limits.window_start<t-interval '1 minute' then t else pakupai.profile_agent_limits.window_start end,count=case when pakupai.profile_agent_limits.window_start<t-interval '1 minute' then 1 else pakupai.profile_agent_limits.count+1 end returning count into n;
 if n>30 then return jsonb_build_object('error','rate_limited');end if;
 perform 1 from public.pakupai_workspaces where id=a.workspace_id for update;
 -- Bounded rolling history, same 1000-message limit as legacy Room.
 delete from public.pakupai_room_messages where workspace_id=a.workspace_id and id in(select id from public.pakupai_room_messages where workspace_id=a.workspace_id order by id desc offset 999);
 insert into public.pakupai_room_messages(workspace_id,agent_id,text) values(a.workspace_id,a.id,args->>'text');return jsonb_build_object('ok',true);end if;
 if op='agent_messages' then return jsonb_build_object('messages',coalesce((select jsonb_agg(to_jsonb(m) order by id) from (select id,agent_id,text,created_at from public.pakupai_room_messages where workspace_id=a.workspace_id and id>coalesce((args->>'after')::bigint,0) order by id limit 100)m),'[]'::jsonb));end if;
 if op='agent_files' then return jsonb_build_object('files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'body',f.body,'revision',f.revision)) from public.pakupai_room_bundles rb join public.pakupai_library_bundle_files bf on bf.bundle_id=rb.bundle_id and bf.workspace_id=rb.workspace_id join public.pakupai_library_files f on f.id=bf.file_id and f.workspace_id=bf.workspace_id where rb.agent_id=a.id and rb.workspace_id=a.workspace_id),'[]'::jsonb));end if;
 end if;
 return jsonb_build_object('error','unknown_operation');
end$$;
revoke all on function public.pakupai_workspace_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.pakupai_workspace_rpc(text,jsonb) to service_role;

-- Bundle and file membership are one owner-authenticated transaction.
create function public.pakupai_create_bundle(w uuid,label text,file_ids uuid[]) returns uuid language plpgsql security invoker set search_path='' as $$
declare b uuid;f uuid;n integer:=0;begin
 if not public.pakupai_owns_workspace(w) then raise exception 'workspace_not_owned' using errcode='42501';end if;
 if cardinality(file_ids)>100 then raise exception 'bundle_limit';end if;
 insert into public.pakupai_library_bundles(workspace_id,name) values(w,label) returning id into b;
 foreach f in array file_ids loop
  insert into public.pakupai_library_bundle_files(bundle_id,file_id,workspace_id,position) values(b,f,w,n);n:=n+1;
 end loop;
 return b;
end$$;
revoke all on function public.pakupai_create_bundle(uuid,text,uuid[]) from public,anon;
grant execute on function public.pakupai_create_bundle(uuid,text,uuid[]) to authenticated;
commit;
