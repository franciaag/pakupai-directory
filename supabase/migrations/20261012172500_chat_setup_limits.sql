begin;
create table pakupai.profile_agent_read_limits(agent_id uuid primary key references public.pakupai_room_agents(id) on delete cascade,window_start timestamptz not null,count integer not null);
alter table pakupai.profile_agent_read_limits enable row level security;
revoke all on pakupai.profile_agent_read_limits from public,anon,authenticated;
create table public.pakupai_agent_setup_tests(
 message_id bigint primary key,workspace_id uuid not null,agent_id uuid not null,nonce text not null,created_at timestamptz not null default clock_timestamp(),
 foreign key(message_id,workspace_id) references public.pakupai_room_messages(id,workspace_id) on delete cascade,
 foreign key(agent_id,workspace_id) references public.pakupai_room_agents(id,workspace_id) on delete cascade);
alter table public.pakupai_agent_setup_tests enable row level security;
revoke all on public.pakupai_agent_setup_tests from public,anon,authenticated;
grant select on public.pakupai_agent_setup_tests to authenticated;
create policy owner_read on public.pakupai_agent_setup_tests to authenticated using(public.pakupai_owns_workspace(workspace_id));
create function public.pakupai_agent_setup_test(w uuid,a uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare m bigint;nonce text;begin
 if not public.pakupai_owns_workspace(w) then raise exception 'workspace_not_owned' using errcode='42501';end if;
 perform 1 from public.pakupai_workspaces where id=w for update;
 if not exists(select 1 from public.pakupai_room_agents where id=a and workspace_id=w and status='approved') then raise exception 'agent_not_approved';end if;
 if exists(select 1 from public.pakupai_agent_setup_tests where workspace_id=w and agent_id=a and created_at>clock_timestamp()-interval '1 minute') then raise exception 'test_rate_limited';end if;
 nonce:=replace(gen_random_uuid()::text,'-','');
 insert into public.pakupai_room_messages(workspace_id,text,targeted) values(w,'Connection test. Please acknowledge reading this message and post a linked reply: Connected. Test received: '||nonce||'. Automatic check-ins: state your actual interval, or unavailable.',true) returning id into m;
 insert into public.pakupai_chat_recipients values(m,w,a);
 insert into public.pakupai_agent_setup_tests(message_id,workspace_id,agent_id,nonce) values(m,w,a,nonce);
 return m;
end$$;
revoke all on function public.pakupai_agent_setup_test(uuid,uuid) from public,anon;
grant execute on function public.pakupai_agent_setup_test(uuid,uuid) to authenticated;
alter function public.pakupai_workspace_rpc(text,jsonb) rename to pakupai_workspace_rpc_check_base;
create function public.pakupai_workspace_rpc(op text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pakupai_room_agents;n integer;t timestamptz:=clock_timestamp();begin
 if op in ('agent_check','agent_messages','agent_read','agent_files','agent_me') then
  select g.* into a from public.pakupai_room_agents g join pakupai.profile_agent_credentials c on c.agent_id=g.id where c.key_hash=args->>'hash';
  if not found then return jsonb_build_object('error','unauthorized');end if;
  if a.status in ('revoked','declined') then return jsonb_build_object('error','revoked');end if;
  insert into pakupai.profile_agent_read_limits values(a.id,t,1) on conflict(agent_id) do update set window_start=case when pakupai.profile_agent_read_limits.window_start<t-interval '1 minute' then t else pakupai.profile_agent_read_limits.window_start end,count=case when pakupai.profile_agent_read_limits.window_start<t-interval '1 minute' then 1 else pakupai.profile_agent_read_limits.count+1 end returning count into n;
  if n>12 then return jsonb_build_object('error','rate_limited','retry_after_seconds',60);end if;
 end if;
 return public.pakupai_workspace_rpc_check_base(op,args);
end$$;
revoke all on function public.pakupai_workspace_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.pakupai_workspace_rpc(text,jsonb) to service_role;
alter function public.pakupai_profile_export() rename to pakupai_profile_export_reply_base;
create function public.pakupai_profile_export() returns jsonb language sql security invoker set search_path='' as $$
 select public.pakupai_profile_export_reply_base() || jsonb_build_object('schema_version',5,'agent_setup_tests',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_agent_setup_tests t),'[]'::jsonb));
$$;
revoke all on function public.pakupai_profile_export() from public,anon;
grant execute on function public.pakupai_profile_export() to authenticated;
commit;
