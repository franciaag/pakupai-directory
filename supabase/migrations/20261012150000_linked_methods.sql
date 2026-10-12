begin;
create table pakupai.pending_methods(username text primary key,user_id uuid unique references auth.users(id) on delete cascade,email text not null,lease text not null,expires_at timestamptz not null);
alter table pakupai.pending_methods enable row level security;
revoke all on pakupai.pending_methods from public,anon,authenticated;
create function public.pakupai_methods_rpc(op text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(args->>'user_id')::uuid; a pakupai.manual_accounts;
begin
 if op='methods' then return jsonb_build_object('username',(select username from pakupai.manual_accounts where user_id=uid and lease is null),'github',exists(select 1 from auth.identities where user_id=uid and provider='github')); end if;
 if op='reserve_add' then
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  perform pg_advisory_xact_lock(hashtextextended(args->>'username',1));
  if not exists(select 1 from auth.identities where user_id=uid and provider='github') or exists(select 1 from pakupai.manual_accounts where user_id=uid) then return '{}'::jsonb;end if;
  delete from pakupai.pending_methods where expires_at<now();
  if exists(select 1 from pakupai.manual_accounts where username=args->>'username') then return '{}'::jsonb;end if;
  insert into pakupai.pending_methods values(args->>'username',uid,args->>'email',args->>'lease',now()+interval '2 minutes') on conflict do nothing;return jsonb_build_object('ok',found);
 end if;
 if op='finish_add' then
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  insert into pakupai.manual_accounts(username,user_id,internal_email,recovery_hash) select username,user_id,email,args->>'hash' from pakupai.pending_methods where user_id=uid and lease=args->>'lease' on conflict do nothing;
  if not found then return '{}'::jsonb;end if;
  delete from pakupai.pending_methods where user_id=uid;return jsonb_build_object('ok',true);end if;
 if op='cancel_add' then delete from pakupai.pending_methods where user_id=uid and lease=args->>'lease';return jsonb_build_object('ok',found);end if;
 return '{}'::jsonb;
end$$;
revoke all on function public.pakupai_methods_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.pakupai_methods_rpc(text,jsonb) to service_role;
create or replace function public.pakupai_manual_rpc(op text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a pakupai.manual_accounts;t timestamptz:=clock_timestamp();n integer;bk text;lim integer;win interval;
begin
 if op='session_valid' then return jsonb_build_object('ok',exists(select 1 from auth.sessions where id=(args->>'session_id')::uuid and user_id=(args->>'user_id')::uuid) and not exists(select 1 from pakupai.manual_accounts where user_id=(args->>'user_id')::uuid and lease is not null));end if;
 if op='limit' then
  bk:=args->>'bucket';lim:=least(20,greatest(1,(args->>'limit')::integer));win:=make_interval(secs=>least(3600,greatest(60,(args->>'seconds')::integer)));
  insert into pakupai.manual_auth_limits values(bk,t,1) on conflict(bucket) do update set started_at=case when pakupai.manual_auth_limits.started_at<t-win then t else pakupai.manual_auth_limits.started_at end,n=case when pakupai.manual_auth_limits.started_at<t-win then 1 else pakupai.manual_auth_limits.n+1 end returning pakupai.manual_auth_limits.n into n;
  delete from pakupai.manual_auth_limits where started_at<t-interval '1 day';return jsonb_build_object('allowed',n<=lim);
 end if;
 if op='reserve' then
  perform pg_advisory_xact_lock(hashtextextended(args->>'username',1));
  if exists(select 1 from pakupai.pending_methods where username=args->>'username' and expires_at>t) then return '{}'::jsonb;end if;
  delete from pakupai.manual_accounts where user_id is null and created_at<t-interval '10 minutes';
  insert into pakupai.manual_accounts(username,internal_email,lease,lease_until) values(args->>'username',args->>'email',args->>'lease',t+interval '2 minutes') on conflict do nothing;
  return jsonb_build_object('ok',found);
 end if;
 select * into a from pakupai.manual_accounts where username=args->>'username' for update;
 if not found then return '{}'::jsonb;end if;
 if op='lookup' then return case when a.user_id is not null and a.lease is null then jsonb_build_object('id',a.user_id,'email',a.internal_email) else '{}'::jsonb end;end if;
 if op='finish_signup' and a.user_id is null and a.lease=args->>'lease' and a.lease_until>t then
  update pakupai.manual_accounts set user_id=(args->>'id')::uuid,recovery_hash=args->>'hash',lease=null,lease_until=null where username=a.username;return jsonb_build_object('ok',true);end if;
 if op='cancel_signup' and a.user_id is null and a.lease=args->>'lease' then delete from pakupai.manual_accounts where username=a.username;return jsonb_build_object('ok',true);end if;
 if op='begin_reset' and a.user_id is not null and ((a.recovery_hash=args->>'hash' and a.lease is null) or (a.reset_hash=args->>'hash' and a.lease is not null and a.lease_until<t)) then
  update pakupai.manual_accounts set reset_hash=coalesce(reset_hash,recovery_hash),recovery_hash=null,lease=args->>'lease',lease_until=t+interval '2 minutes' where username=a.username;return jsonb_build_object('id',a.user_id);end if;
 if op='abort_reset' and a.lease=args->>'lease' then update pakupai.manual_accounts set recovery_hash=reset_hash,reset_hash=null,lease=null,lease_until=null where username=a.username;return jsonb_build_object('ok',true);end if;
 if op='finish_reset' and a.lease=args->>'lease' then
  delete from auth.sessions where user_id=a.user_id;
  update pakupai.manual_accounts set recovery_hash=args->>'hash',reset_hash=null,lease=null,lease_until=null where username=a.username;return jsonb_build_object('ok',true);end if;
 return '{}'::jsonb;
end$$;
commit;
