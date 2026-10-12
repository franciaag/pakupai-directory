begin;
alter table public.pakupai_room_messages add column targeted boolean not null default false;
alter table public.pakupai_room_messages add constraint message_workspace_unique unique(id,workspace_id);
create table public.pakupai_chat_recipients(
 message_id bigint not null,workspace_id uuid not null,agent_id uuid not null,primary key(message_id,agent_id),
 foreign key(message_id,workspace_id) references public.pakupai_room_messages(id,workspace_id) on delete cascade,
 foreign key(agent_id,workspace_id) references public.pakupai_room_agents(id,workspace_id) on delete cascade);
create table public.pakupai_chat_attachments(
 id uuid primary key default gen_random_uuid(),message_id bigint not null,workspace_id uuid not null,
 kind text not null check(kind in ('file','bundle')),ref_id uuid not null,name text not null,revision bigint,file_count integer not null,
 foreign key(message_id,workspace_id) references public.pakupai_room_messages(id,workspace_id) on delete cascade);
create table public.pakupai_chat_preferences(
 workspace_id uuid primary key references public.pakupai_workspaces(id) on delete cascade,
 recipient_ids uuid[] not null default '{}',updated_at timestamptz not null default now());
do $$declare t text;begin foreach t in array array['pakupai_chat_recipients','pakupai_chat_attachments','pakupai_chat_preferences'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I to authenticated using(public.pakupai_owns_workspace(workspace_id))',t);
end loop;end$$;
create function public.pakupai_chat_send(w uuid,body text,recipients uuid[] default '{}',items jsonb default '[]') returns bigint language plpgsql security definer set search_path='' as $$
declare m bigint;a uuid;i jsonb;item_name text;rev bigint;cnt integer;k text;r uuid;begin
 if not public.pakupai_owns_workspace(w) then raise exception 'workspace_not_owned' using errcode='42501';end if;
 perform 1 from public.pakupai_workspaces where id=w for update;
 if cardinality(recipients)>100 or jsonb_array_length(items)>20 or length(body)>6000 or (length(trim(body))=0 and jsonb_array_length(items)=0) then raise exception 'invalid_message';end if;
 foreach a in array recipients loop
  if not exists(select 1 from public.pakupai_room_agents where id=a and workspace_id=w and status='approved') then raise exception 'recipient_not_approved';end if;
 end loop;
 insert into public.pakupai_room_messages(workspace_id,text,targeted) values(w,coalesce(nullif(trim(body),''),'Shared Library items'),cardinality(recipients)>0) returning id into m;
 insert into public.pakupai_chat_recipients select m,w,t.agent from (select distinct unnest(recipients) agent)t;
 for i in select value from jsonb_array_elements(items) loop
  k:=i->>'kind';r:=(i->>'id')::uuid;item_name:=null;rev:=null;cnt:=0;
  if k='file' then select name,revision,1 into item_name,rev,cnt from public.pakupai_library_files where id=r and workspace_id=w;
  elsif k='bundle' then select name,(select count(*) from public.pakupai_library_bundle_files where bundle_id=r and workspace_id=w) into item_name,cnt from public.pakupai_library_bundles where id=r and workspace_id=w;
  end if;
  if item_name is null then raise exception 'library_item_missing';end if;
  insert into public.pakupai_chat_attachments(message_id,workspace_id,kind,ref_id,name,revision,file_count) values(m,w,k,r,item_name,rev,cnt);
 end loop;
 insert into public.pakupai_chat_preferences(workspace_id,recipient_ids) values(w,recipients) on conflict(workspace_id) do update set recipient_ids=excluded.recipient_ids,updated_at=now();
 return m;
end$$;
revoke all on function public.pakupai_chat_send(uuid,text,uuid[],jsonb) from public,anon;
grant execute on function public.pakupai_chat_send(uuid,text,uuid[],jsonb) to authenticated;
create function public.pakupai_chat_save_preferences(w uuid,recipients uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare a uuid;begin
 if not public.pakupai_owns_workspace(w) then raise exception 'workspace_not_owned' using errcode='42501';end if;
 if cardinality(recipients)>100 then raise exception 'invalid_recipients';end if;
 foreach a in array recipients loop if not exists(select 1 from public.pakupai_room_agents where id=a and workspace_id=w and status='approved') then raise exception 'recipient_not_approved';end if;end loop;
 insert into public.pakupai_chat_preferences(workspace_id,recipient_ids) values(w,recipients) on conflict(workspace_id) do update set recipient_ids=excluded.recipient_ids,updated_at=now();
end$$;
revoke all on function public.pakupai_chat_save_preferences(uuid,uuid[]) from public,anon;
grant execute on function public.pakupai_chat_save_preferences(uuid,uuid[]) to authenticated;
-- Preserve every workspace operation, routing message reads through recipient and assignment checks.
alter function public.pakupai_workspace_rpc(text,jsonb) rename to pakupai_workspace_rpc_base;
create function public.pakupai_workspace_rpc(op text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pakupai_room_agents;res jsonb;begin
 if op<>'agent_messages' then return public.pakupai_workspace_rpc_base(op,args);end if;
 select g.* into a from public.pakupai_room_agents g join pakupai.profile_agent_credentials c on c.agent_id=g.id where c.key_hash=args->>'hash';
 if not found then return jsonb_build_object('error','unauthorized');end if;
 if a.status in ('revoked','declined') then return jsonb_build_object('error','revoked');end if;
 if a.status<>'approved' then return jsonb_build_object('error','not_approved');end if;
 select coalesce(jsonb_agg(v order by id),'[]'::jsonb) into res from (
 select m.id,jsonb_build_object('id',m.id,'agent_id',m.agent_id,'text',m.text,'created_at',m.created_at,'attachments',coalesce((
 select jsonb_agg(jsonb_build_object('kind',at.kind,'id',at.ref_id,'name',at.name,'revision',at.revision,'file_count',at.file_count))
 from public.pakupai_chat_attachments at where at.message_id=m.id and exists(
 select 1 from public.pakupai_room_bundles rb where rb.workspace_id=a.workspace_id and rb.agent_id=a.id and (
 (at.kind='bundle' and rb.bundle_id=at.ref_id) or (at.kind='file' and exists(select 1 from public.pakupai_library_bundle_files bf where bf.workspace_id=a.workspace_id and bf.bundle_id=rb.bundle_id and bf.file_id=at.ref_id))))),'[]'::jsonb)) v
 from public.pakupai_room_messages m where m.workspace_id=a.workspace_id and m.id>coalesce((args->>'after')::bigint,0)
 and (not m.targeted or exists(select 1 from public.pakupai_chat_recipients cr where cr.message_id=m.id and cr.agent_id=a.id)) order by m.id limit 100)t;
 return jsonb_build_object('messages',res);
end$$;
revoke all on function public.pakupai_workspace_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.pakupai_workspace_rpc(text,jsonb) to service_role;
commit;
