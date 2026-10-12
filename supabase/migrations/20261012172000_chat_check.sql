begin;
alter function public.pakupai_workspace_rpc(text,jsonb) rename to pakupai_workspace_rpc_reply_base;
create function public.pakupai_workspace_rpc(op text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pakupai_room_agents;n bigint;latest bigint;t timestamptz:=clock_timestamp();begin
 if op<>'agent_check' then return public.pakupai_workspace_rpc_reply_base(op,args);end if;
 select g.* into a from public.pakupai_room_agents g join pakupai.profile_agent_credentials c on c.agent_id=g.id where c.key_hash=args->>'hash';
 if not found then return jsonb_build_object('error','unauthorized');end if;
 if a.status in ('revoked','declined') then return jsonb_build_object('error','revoked');end if;
 if a.status<>'approved' then return jsonb_build_object('error','not_approved');end if;
 select count(*),max(m.id) into n,latest from public.pakupai_room_messages m where m.workspace_id=a.workspace_id and m.id>coalesce((args->>'after')::bigint,0) and (not m.targeted or exists(select 1 from public.pakupai_chat_recipients cr where cr.message_id=m.id and cr.agent_id=a.id));
 insert into public.pakupai_agent_checks values(a.id,a.workspace_id,t) on conflict(agent_id) do update set last_checked_at=excluded.last_checked_at where public.pakupai_agent_checks.last_checked_at<t-interval '1 minute';
 return jsonb_build_object('count',n,'latest_id',latest);
end$$;
revoke all on function public.pakupai_workspace_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.pakupai_workspace_rpc(text,jsonb) to service_role;
commit;
