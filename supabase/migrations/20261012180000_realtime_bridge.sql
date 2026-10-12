begin;
create table pakupai.bridge_identities(agent_id uuid primary key references public.pakupai_room_agents(id) on delete cascade,auth_user_id uuid not null unique references auth.users(id) on delete cascade);
create table pakupai.bridge_leases(agent_id uuid primary key references public.pakupai_room_agents(id) on delete cascade,topic text not null unique,expires_at timestamptz not null);
create table public.pakupai_bridge_signals(nonce uuid primary key default gen_random_uuid(),message_id bigint not null references public.pakupai_room_messages(id) on delete cascade,workspace_id uuid not null,agent_id uuid not null,created_at timestamptz not null default clock_timestamp(),received_at timestamptz,foreign key(agent_id,workspace_id) references public.pakupai_room_agents(id,workspace_id) on delete cascade);
do $$declare t text;begin foreach t in array array['bridge_identities','bridge_leases'] loop execute format('alter table pakupai.%I enable row level security',t);execute format('revoke all on pakupai.%I from public,anon,authenticated',t);end loop;end$$;
alter table public.pakupai_bridge_signals enable row level security;
revoke all on public.pakupai_bridge_signals from public,anon,authenticated;
grant select on public.pakupai_bridge_signals to authenticated;
create policy owner_read on public.pakupai_bridge_signals for select to authenticated using(public.pakupai_owns_workspace(workspace_id));
create function public.pakupai_bridge_rpc(op text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pakupai_room_agents;u uuid;topic text;begin
 select g.* into a from public.pakupai_room_agents g join pakupai.profile_agent_credentials c on c.agent_id=g.id where c.key_hash=args->>'hash' for update of g;
 if not found then return jsonb_build_object('error','unauthorized');end if;
 if a.status<>'approved' then return jsonb_build_object('error',case when a.status in ('revoked','declined') then 'revoked' else 'not_approved' end);end if;
 if op='identity' then select auth_user_id into u from pakupai.bridge_identities where agent_id=a.id;return jsonb_build_object('agent_id',a.id,'auth_user_id',u);end if;
 if op='register_identity' then
  if not exists(select 1 from auth.users where id=(args->>'auth_user_id')::uuid and raw_app_meta_data->>'pakupai_bridge_agent'=a.id::text) then return jsonb_build_object('error','identity_invalid');end if;
  insert into pakupai.bridge_identities values(a.id,(args->>'auth_user_id')::uuid) on conflict(agent_id) do nothing;select auth_user_id into u from pakupai.bridge_identities where agent_id=a.id;return jsonb_build_object('auth_user_id',u);
 end if;
 if op='lease' then
  if not exists(select 1 from pakupai.bridge_identities where agent_id=a.id and auth_user_id=(args->>'auth_user_id')::uuid) then return jsonb_build_object('error','identity_invalid');end if;
  select l.topic into topic from pakupai.bridge_leases l where agent_id=a.id and expires_at>clock_timestamp();
  topic:=coalesce(topic,'pakupai-agent-'||gen_random_uuid()::text);
  insert into pakupai.bridge_leases values(a.id,topic,clock_timestamp()+interval '1 hour') on conflict(agent_id) do update set topic=excluded.topic,expires_at=excluded.expires_at;
  return jsonb_build_object('topic',topic);
 end if;
 if op='signal' then
  update public.pakupai_bridge_signals set received_at=coalesce(received_at,clock_timestamp()) where nonce=(args->>'nonce')::uuid and agent_id=a.id;
  return jsonb_build_object('ok',found);
 end if;
 return jsonb_build_object('error','unknown_operation');end$$;
revoke all on function public.pakupai_bridge_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.pakupai_bridge_rpc(text,jsonb) to service_role;
create function public.pakupai_bridge_can_listen(topic text) returns boolean language sql security definer set search_path='' stable as $$
 select exists(select 1 from pakupai.bridge_identities i join pakupai.bridge_leases l on l.agent_id=i.agent_id join public.pakupai_room_agents a on a.id=i.agent_id where i.auth_user_id=auth.uid() and l.topic=$1 and l.expires_at>now() and a.status='approved');
$$;
revoke all on function public.pakupai_bridge_can_listen(text) from public,anon;
grant execute on function public.pakupai_bridge_can_listen(text) to authenticated;
create policy pakupai_bridge_listen on realtime.messages for select to authenticated using(extension='broadcast' and public.pakupai_bridge_can_listen(realtime.topic()));
-- Deferred signal sees recipients/attachments inserted later in the same transaction.
create function pakupai.bridge_wake() returns trigger language plpgsql security definer set search_path='' as $$
declare a record;n uuid;begin
 if new.agent_id is not null then return new;end if;
 for a in select g.id,l.topic from public.pakupai_room_agents g join pakupai.bridge_leases l on l.agent_id=g.id where g.workspace_id=new.workspace_id and g.status='approved' and l.expires_at>clock_timestamp() and (not new.targeted or exists(select 1 from public.pakupai_chat_recipients r where r.message_id=new.id and r.agent_id=g.id)) loop
 insert into public.pakupai_bridge_signals(message_id,workspace_id,agent_id) values(new.id,new.workspace_id,a.id) returning nonce into n;
 perform realtime.send(jsonb_build_object('nonce',n),'wake',a.topic,true);
 end loop;
 return new;end$$;
revoke all on function pakupai.bridge_wake() from public,anon,authenticated;
create constraint trigger bridge_wake after insert on public.pakupai_room_messages deferrable initially deferred for each row execute function pakupai.bridge_wake();
create function pakupai.bridge_revoke() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.status in ('revoked','declined') then delete from pakupai.bridge_leases where agent_id=new.id;update auth.users set banned_until=clock_timestamp()+interval '100 years' where id in(select auth_user_id from pakupai.bridge_identities where agent_id=new.id);end if;return new;end$$;
revoke all on function pakupai.bridge_revoke() from public,anon,authenticated;
create trigger bridge_revoke after update of status on public.pakupai_room_agents for each row when(new.status in ('revoked','declined')) execute function pakupai.bridge_revoke();
commit;
