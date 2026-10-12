begin;
create table pakupai.bridge_token_limits(agent_id uuid primary key references public.pakupai_room_agents(id) on delete cascade,window_start timestamptz not null,count integer not null);
alter table pakupai.bridge_token_limits enable row level security;
revoke all on pakupai.bridge_token_limits from public,anon,authenticated;
alter function public.pakupai_bridge_rpc(text,jsonb) rename to pakupai_bridge_rpc_base;
create function public.pakupai_bridge_rpc(op text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pakupai_room_agents;n integer;t timestamptz:=clock_timestamp();begin
 if op<>'token_limit' then return public.pakupai_bridge_rpc_base(op,args);end if;
 select g.* into a from public.pakupai_room_agents g join pakupai.profile_agent_credentials c on c.agent_id=g.id where c.key_hash=args->>'hash' for update of g;
 if not found then return jsonb_build_object('error','unauthorized');end if;
 if a.status<>'approved' then return jsonb_build_object('error','not_approved');end if;
 insert into pakupai.bridge_token_limits values(a.id,t,1) on conflict(agent_id) do update set window_start=case when pakupai.bridge_token_limits.window_start<t-interval '10 minutes' then t else pakupai.bridge_token_limits.window_start end,count=case when pakupai.bridge_token_limits.window_start<t-interval '10 minutes' then 1 else pakupai.bridge_token_limits.count+1 end returning count into n;
 return jsonb_build_object('allowed',n<=4,'retry_after_seconds',600);
end$$;
revoke all on function public.pakupai_bridge_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.pakupai_bridge_rpc(text,jsonb) to service_role;
-- Service identities may not create unrelated owner workspaces.
create function pakupai.bridge_no_bootstrap() returns trigger language plpgsql security definer set search_path='' as $$
begin if exists(select 1 from auth.users where id=coalesce(new.owner_id,auth.uid()) and raw_app_meta_data ? 'pakupai_bridge_agent') then raise exception 'bridge_identity_not_owner' using errcode='42501';end if;return new;end$$;
revoke all on function pakupai.bridge_no_bootstrap() from public,anon,authenticated;
create trigger bridge_no_workspace before insert on public.pakupai_workspaces for each row execute function pakupai.bridge_no_bootstrap();
commit;
