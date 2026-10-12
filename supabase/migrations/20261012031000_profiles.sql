begin;
-- Additive private accounts. Legacy passphrase data remains untouched.
create table public.pakupai_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=60),
 created_at timestamptz not null default now());
create table public.pakupai_watchlist(
 user_id uuid not null references public.pakupai_profiles(user_id) on delete cascade,
 item_id text not null check(item_id ~ '^[a-z0-9][a-z0-9_-]{0,119}$'),
 created_at timestamptz not null default now(),primary key(user_id,item_id));
create table public.pakupai_workspaces(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null unique references auth.users(id) on delete cascade,
 name text not null default 'My Room' check(length(name) between 1 and 80),
 created_at timestamptz not null default now());
create table public.pakupai_room_agents(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.pakupai_workspaces(id) on delete cascade,
 name text not null check(length(name) between 1 and 60),role text not null default '' check(length(role)<=120),
 status text not null default 'pending' check(status in ('pending','approved','revoked','declined')),
 created_at timestamptz not null default now(),unique(id,workspace_id));
create table public.pakupai_room_messages(
 id bigint generated always as identity primary key,workspace_id uuid not null references public.pakupai_workspaces(id) on delete cascade,
 agent_id uuid,text text not null check(length(text) between 1 and 6000),created_at timestamptz not null default now(),
 foreign key(agent_id,workspace_id) references public.pakupai_room_agents(id,workspace_id));
create index pakupai_messages_workspace_page on public.pakupai_room_messages(workspace_id,id);
create table public.pakupai_library_files(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.pakupai_workspaces(id) on delete cascade,
 name text not null check(length(name) between 1 and 120),description text not null default '' check(length(description)<=1000),
 body text not null default '' check(octet_length(body)<=100000),revision bigint not null default 1,
 updated_at timestamptz not null default now(),unique(id,workspace_id));
create table public.pakupai_library_versions(
 file_id uuid not null,workspace_id uuid not null,revision bigint not null,body text not null check(octet_length(body)<=100000),
 created_at timestamptz not null default now(),primary key(file_id,revision),
 foreign key(file_id,workspace_id) references public.pakupai_library_files(id,workspace_id) on delete cascade);
create table public.pakupai_library_bundles(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.pakupai_workspaces(id) on delete cascade,
 name text not null check(length(name) between 1 and 120),unique(id,workspace_id));
create table public.pakupai_library_bundle_files(
 bundle_id uuid not null,file_id uuid not null,workspace_id uuid not null,position integer not null default 0,
 primary key(bundle_id,file_id),foreign key(bundle_id,workspace_id) references public.pakupai_library_bundles(id,workspace_id) on delete cascade,
 foreign key(file_id,workspace_id) references public.pakupai_library_files(id,workspace_id) on delete cascade);
create table public.pakupai_room_bundles(
 agent_id uuid primary key,bundle_id uuid not null,workspace_id uuid not null,
 foreign key(agent_id,workspace_id) references public.pakupai_room_agents(id,workspace_id) on delete cascade,
 foreign key(bundle_id,workspace_id) references public.pakupai_library_bundles(id,workspace_id) on delete cascade);
-- Credential-bearing tables stay outside the exposed API schema.
create table pakupai.profile_agent_credentials(
 agent_id uuid primary key references public.pakupai_room_agents(id) on delete cascade,key_hash text not null unique);
create table pakupai.profile_invites(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.pakupai_workspaces(id) on delete cascade,
 token_hash text not null unique,expires_at timestamptz not null,used_at timestamptz,revoked_at timestamptz);
create table pakupai.legacy_profile_links(
 singleton boolean primary key default true check(singleton),user_id uuid not null unique references auth.users(id),
 linked_at timestamptz not null default now());
alter table pakupai.profile_agent_credentials enable row level security;
alter table pakupai.profile_invites enable row level security;
alter table pakupai.legacy_profile_links enable row level security;
revoke all on pakupai.profile_agent_credentials,pakupai.profile_invites,pakupai.legacy_profile_links from public,anon,authenticated;
create function public.pakupai_owns_workspace(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pakupai_workspaces where id=w and owner_id=(select auth.uid()))
$$;
revoke all on function public.pakupai_owns_workspace(uuid) from public,anon;
grant execute on function public.pakupai_owns_workspace(uuid) to authenticated;
do $$declare t text;begin
 foreach t in array array['pakupai_profiles','pakupai_watchlist','pakupai_workspaces','pakupai_room_agents','pakupai_room_messages','pakupai_library_files','pakupai_library_versions','pakupai_library_bundles','pakupai_library_bundle_files','pakupai_room_bundles'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 if t in ('pakupai_profiles','pakupai_watchlist') then
 execute format('create policy owner_rows on public.%I to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
 elsif t='pakupai_workspaces' then
 execute format('create policy owner_rows on public.%I to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()))',t);
 else
 execute format('create policy owner_rows on public.%I to authenticated using(public.pakupai_owns_workspace(workspace_id)) with check(public.pakupai_owns_workspace(workspace_id))',t);
 end if;
 end loop;
end$$;
grant usage,select on sequence public.pakupai_room_messages_id_seq to authenticated;
-- No auth signup trigger: profile creation is idempotent and cannot break Auth signup.
create function public.pakupai_profile_bootstrap() returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=(select auth.uid());w uuid;begin
 if u is null then raise exception 'authentication_required' using errcode='42501';end if;
 insert into public.pakupai_profiles(user_id) values(u) on conflict do nothing;
 insert into public.pakupai_workspaces(owner_id) values(u) on conflict(owner_id) do nothing;
 select id into w from public.pakupai_workspaces where owner_id=u;
 return jsonb_build_object('workspace_id',w,'user_id',u);
end$$;
create function public.pakupai_profile_export() returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('schema_version',1,'exported_at',now(),
 'profile',(select to_jsonb(p) from public.pakupai_profiles p where user_id=(select auth.uid())),
 'watchlist',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_watchlist t),'[]'::jsonb),
 'workspaces',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_workspaces t),'[]'::jsonb),
 'agents',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_room_agents t),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_room_messages t),'[]'::jsonb),
 'files',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_library_files t),'[]'::jsonb),
 'versions',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_library_versions t),'[]'::jsonb),
 'bundles',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_library_bundles t),'[]'::jsonb),
 'bundle_files',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_library_bundle_files t),'[]'::jsonb),
 'room_bundles',coalesce((select jsonb_agg(to_jsonb(t)) from public.pakupai_room_bundles t),'[]'::jsonb))
$$;
revoke all on function public.pakupai_profile_bootstrap(),public.pakupai_profile_export() from public,anon;
grant execute on function public.pakupai_profile_bootstrap(),public.pakupai_profile_export() to authenticated;
-- Serialise per-workspace writes to enforce small free-tier limits.
create function pakupai.profile_write_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare w uuid;total bigint;cap integer;begin
 if tg_table_name='pakupai_watchlist' then
  perform 1 from public.pakupai_profiles where user_id=new.user_id for update;
  if tg_op='INSERT' and (select count(*) from public.pakupai_watchlist where user_id=new.user_id)>=500 then raise exception 'watchlist_limit';end if;
  return new;
 end if;
 w:=new.workspace_id;
 perform 1 from public.pakupai_workspaces where id=w for update;
 if tg_op='UPDATE' and new.workspace_id<>old.workspace_id then raise exception 'workspace_is_immutable';end if;
 cap:=case tg_table_name when 'pakupai_room_agents' then 100 when 'pakupai_room_messages' then 1000 when 'pakupai_library_files' then 100 when 'pakupai_library_bundles' then 100 else 1000 end;
 if tg_op='INSERT' then
 execute format('select count(*) from public.%I where workspace_id=$1',tg_table_name) into total using w;
 if total>=cap then raise exception 'workspace_limit';end if;
 end if;
 if tg_table_name='pakupai_library_files' then
  select coalesce(sum(octet_length(body)),0) into total from public.pakupai_library_files where workspace_id=w and id<>new.id;
  if total+octet_length(new.body)>5000000 then raise exception 'library_size_limit';end if;
  if tg_op='UPDATE' then
   if new.revision<>old.revision then raise exception 'revision_conflict';end if;
   if new.body is distinct from old.body then
    insert into public.pakupai_library_versions(file_id,workspace_id,revision,body) values(old.id,w,old.revision,old.body);
    delete from public.pakupai_library_versions where file_id=old.id and revision<old.revision-4;
    new.revision:=old.revision+1;
   end if;
   new.updated_at:=now();
  end if;
 end if;
 return new;
end$$;
revoke all on function pakupai.profile_write_guard() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['pakupai_watchlist','pakupai_room_agents','pakupai_room_messages','pakupai_library_files','pakupai_library_bundles','pakupai_library_bundle_files','pakupai_room_bundles'] loop
 execute format('create trigger write_guard before insert or update on public.%I for each row execute function pakupai.profile_write_guard()',t);
 end loop;
end$$;
-- History is immutable to users; only the server-side file trigger writes it.
revoke insert,update,delete on public.pakupai_library_versions from authenticated;
create function public.pakupai_legacy_profile(op text,u uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare linked uuid;begin
 perform 1 from pakupai.room_config where singleton for update;
 select user_id into linked from pakupai.legacy_profile_links where singleton;
 if op='link' then
  if not exists(select 1 from auth.users where id=u) then raise exception 'unknown_user';end if;
  if linked is not null and linked<>u then return jsonb_build_object('error','already_linked');end if;
  insert into pakupai.legacy_profile_links(user_id) values(u) on conflict(singleton) do nothing;
  return jsonb_build_object('linked',true);
 end if;
 return jsonb_build_object('linked',coalesce(linked=u,false));
end$$;
revoke all on function public.pakupai_legacy_profile(text,uuid) from public,anon,authenticated;
grant execute on function public.pakupai_legacy_profile(text,uuid) to service_role;
commit;
