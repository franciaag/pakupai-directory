begin;
create table public.pakupai_chat_reply_links(
 reply_message_id bigint primary key,workspace_id uuid not null,agent_id uuid not null,in_reply_to bigint not null,
 foreign key(reply_message_id,workspace_id) references public.pakupai_room_messages(id,workspace_id) on delete cascade,
 foreign key(in_reply_to,workspace_id) references public.pakupai_room_messages(id,workspace_id) on delete cascade,
 foreign key(agent_id,workspace_id) references public.pakupai_room_agents(id,workspace_id) on delete cascade);
alter table public.pakupai_chat_reply_links enable row level security;
revoke all on public.pakupai_chat_reply_links from public,anon,authenticated;
grant select on public.pakupai_chat_reply_links to authenticated;
create policy owner_read on public.pakupai_chat_reply_links to authenticated using(public.pakupai_owns_workspace(workspace_id));
alter function public.pakupai_workspace_rpc(text,jsonb) rename to pakupai_workspace_rpc_receipt_base;
create function public.pakupai_workspace_rpc(op text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pakupai_room_agents;res jsonb;reply_to bigint;m bigint;begin
 if op<>'agent_post' or args->>'reply_to_message_id' is null then return public.pakupai_workspace_rpc_receipt_base(op,args);end if;
 select g.* into a from public.pakupai_room_agents g join pakupai.profile_agent_credentials c on c.agent_id=g.id where c.key_hash=args->>'hash' for update of g;
 if not found then return jsonb_build_object('error','unauthorized');end if;
 if a.status in ('revoked','declined') then return jsonb_build_object('error','revoked');end if;
 if a.status<>'approved' then return jsonb_build_object('error','not_approved');end if;
 begin reply_to:=(args->>'reply_to_message_id')::bigint;exception when others then return jsonb_build_object('error','invalid_reply_to');end;
 if not exists(select 1 from public.pakupai_chat_receipts r join public.pakupai_room_messages m on m.id=r.message_id where r.agent_id=a.id and r.message_id=reply_to and r.workspace_id=a.workspace_id and m.agent_id is null and (not m.targeted or exists(select 1 from public.pakupai_chat_recipients cr where cr.message_id=m.id and cr.agent_id=a.id))) then return jsonb_build_object('error','reply_target_not_fetched');end if;
 res:=public.pakupai_workspace_rpc_receipt_base(op,args);
 if res ? 'error' then return res;end if;
 select id into m from public.pakupai_room_messages where workspace_id=a.workspace_id and agent_id=a.id order by id desc limit 1;
 -- Rolling history can remove the target; never invent a dangling reply link.
 if exists(select 1 from public.pakupai_room_messages where id=reply_to) then insert into public.pakupai_chat_reply_links values(m,a.workspace_id,a.id,reply_to);end if;
 return res || jsonb_build_object('message_id',m);
end$$;
revoke all on function public.pakupai_workspace_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.pakupai_workspace_rpc(text,jsonb) to service_role;
alter function public.pakupai_profile_export() rename to pakupai_profile_export_receipt_base;
create function public.pakupai_profile_export() returns jsonb language sql security invoker set search_path='' as $$
 select public.pakupai_profile_export_receipt_base() || jsonb_build_object('schema_version',4,'chat_reply_links',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_chat_reply_links t),'[]'::jsonb));
$$;
revoke all on function public.pakupai_profile_export() from public,anon;
grant execute on function public.pakupai_profile_export() to authenticated;
commit;
