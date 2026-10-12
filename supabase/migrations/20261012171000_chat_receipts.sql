begin;
-- Additive receipt history. Never backfill historical reads.
create table public.pakupai_chat_receipts(
 message_id bigint not null,workspace_id uuid not null,agent_id uuid not null,
 fetched_at timestamptz not null default clock_timestamp(),read_at timestamptz,
 primary key(message_id,agent_id),
 foreign key(message_id,workspace_id) references public.pakupai_room_messages(id,workspace_id) on delete cascade,
 foreign key(agent_id,workspace_id) references public.pakupai_room_agents(id,workspace_id) on delete cascade);
create table public.pakupai_agent_checks(
 agent_id uuid primary key,workspace_id uuid not null,last_checked_at timestamptz not null,
 foreign key(agent_id,workspace_id) references public.pakupai_room_agents(id,workspace_id) on delete cascade);
do $$declare t text;begin foreach t in array array['pakupai_chat_receipts','pakupai_agent_checks'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I to authenticated using(public.pakupai_owns_workspace(workspace_id))',t);
end loop;end$$;
-- Wrap the existing filtered API without altering old messages or agents.
alter function public.pakupai_workspace_rpc(text,jsonb) rename to pakupai_workspace_rpc_chat_base;
create function public.pakupai_workspace_rpc(op text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pakupai_room_agents;res jsonb;ids bigint[];t timestamptz:=clock_timestamp();begin
 if op not in ('agent_messages','agent_read') then return public.pakupai_workspace_rpc_chat_base(op,args);end if;
 select g.* into a from public.pakupai_room_agents g join pakupai.profile_agent_credentials c on c.agent_id=g.id where c.key_hash=args->>'hash' for update of g;
 if not found then return jsonb_build_object('error','unauthorized');end if;
 if a.status in ('revoked','declined') then return jsonb_build_object('error','revoked');end if;
 if a.status<>'approved' then return jsonb_build_object('error','not_approved');end if;
 if op='agent_messages' then
  res:=public.pakupai_workspace_rpc_chat_base(op,args);
  if res ? 'error' then return res;end if;
  insert into public.pakupai_agent_checks values(a.id,a.workspace_id,t) on conflict(agent_id) do update set last_checked_at=excluded.last_checked_at;
  insert into public.pakupai_chat_receipts(message_id,workspace_id,agent_id,fetched_at)
  select (m->>'id')::bigint,a.workspace_id,a.id,t from jsonb_array_elements(res->'messages') m
  on conflict(message_id,agent_id) do nothing;
  return res;
 end if;
 if jsonb_typeof(args->'message_ids') is distinct from 'array' or jsonb_array_length(args->'message_ids')>100 then return jsonb_build_object('error','invalid_message_ids');end if;
 begin select array_agg(distinct v::bigint) into ids from jsonb_array_elements_text(args->'message_ids') v;exception when others then return jsonb_build_object('error','invalid_message_ids');end;
 if exists(select 1 from unnest(ids) i where not exists(select 1 from public.pakupai_chat_receipts r where r.message_id=i and r.agent_id=a.id and r.workspace_id=a.workspace_id)) then return jsonb_build_object('error','message_not_fetched');end if;
 update public.pakupai_chat_receipts set read_at=coalesce(read_at,t) where agent_id=a.id and message_id=any(ids);
 return jsonb_build_object('ok',true,'acknowledged',coalesce(cardinality(ids),0));
end$$;
revoke all on function public.pakupai_workspace_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.pakupai_workspace_rpc(text,jsonb) to service_role;
-- Keep private export complete without editing source records.
alter function public.pakupai_profile_export() rename to pakupai_profile_export_chat_base;
create function public.pakupai_profile_export() returns jsonb language sql security invoker set search_path='' as $$
 select public.pakupai_profile_export_chat_base() || jsonb_build_object('schema_version',3,
 'chat_receipts',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_chat_receipts t),'[]'::jsonb),
 'agent_checks',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_agent_checks t),'[]'::jsonb));
$$;
revoke all on function public.pakupai_profile_export() from public,anon;
grant execute on function public.pakupai_profile_export() to authenticated;
commit;
