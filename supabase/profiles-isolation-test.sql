begin;
insert into auth.users(id) values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.pakupai_profile_bootstrap();
insert into public.pakupai_watchlist values(auth.uid(),'aider',now());
insert into public.pakupai_library_files(workspace_id,name,body) select id,'Test','private A' from public.pakupai_workspaces;
update public.pakupai_library_files set body='revised';
do $$begin
 if (select count(*) from public.pakupai_library_versions)<>1 then raise exception 'history_fail';end if;
 if (select revision from public.pakupai_library_files)<>2 then raise exception 'revision_fail';end if;
 begin
 insert into public.pakupai_profiles(user_id) values('00000000-0000-4000-8000-000000000002');
 raise exception 'spoof_not_denied';
 exception when insufficient_privilege then null;end;
 begin
 perform public.pakupai_legacy_profile('link','00000000-0000-4000-8000-000000000001');
 raise exception 'legacy_link_not_denied';
 exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select public.pakupai_profile_bootstrap();
do $$begin
 if (select count(*) from public.pakupai_profiles)<>1 then raise exception 'profile_leak';end if;
 if exists(select 1 from public.pakupai_library_files) then raise exception 'files_leak';end if;
 if exists(select 1 from public.pakupai_library_versions) then raise exception 'versions_leak';end if;
 if exists(select 1 from public.pakupai_watchlist) then raise exception 'watchlist_leak';end if;
 if jsonb_array_length(public.pakupai_profile_export()->'files')<>0 then raise exception 'export_leak';end if;
 begin
 insert into public.pakupai_library_files(workspace_id,name) values((select id from public.pakupai_workspaces where owner_id=auth.uid()),'Own');
 update public.pakupai_library_files set workspace_id='00000000-0000-4000-8000-000000000003';
 raise exception 'move_not_denied';
 exception when raise_exception then if sqlerrm='move_not_denied' then raise;end if;end;
end$$;
reset role;
set local role anon;
do $$begin
 begin perform 1 from public.pakupai_profiles;raise exception 'anon_not_denied';exception when insufficient_privilege then null;end;
 begin perform public.pakupai_profile_export();raise exception 'anon_export_not_denied';exception when insufficient_privilege then null;end;
end$$;
reset role;
select jsonb_build_object('isolation','passed','spoof_denial','passed','history','passed','legacy_link_denial','passed','anonymous_denial','passed','test_rows','rolled back') as tests;
rollback;
