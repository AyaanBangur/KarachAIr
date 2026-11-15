-- KarachAir: joining an organization needs its invite code. (Already applied to the live project.)
create or replace function public.tw_join_org_code(p_token text, p_org uuid, p_code text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare s public.tw_sessions; v public.tw_volunteers; o public.tw_orgs; m public.tw_members;
begin
  s := public.tw_auth(p_token);
  if s.token_hash is null or s.role <> 'volunteer' or s.volunteer_id is null then return jsonb_build_object('error','Please sign in again.'); end if;
  select * into v from public.tw_volunteers where id = s.volunteer_id;
  select * into o from public.tw_orgs where id = p_org;
  if not found then return jsonb_build_object('error','Choose an organization from the list.'); end if;
  select * into m from public.tw_members where org_id = o.id and volunteer_id = v.id;
  if not found then
    if upper(btrim(coalesce(p_code,''))) <> upper(coalesce(o.join_code,'-')) then return jsonb_build_object('error','That invite code is not right. Ask your coordinator for the code.'); end if;
    if (select count(*) from public.tw_members where org_id = o.id) >= 500 then return jsonb_build_object('error','This organization has reached its volunteer limit.'); end if;
    insert into public.tw_members(org_id, volunteer_id, display_name, email) values (o.id, v.id, v.name, lower(v.email)) returning * into m;
  else
    update public.tw_members set display_name = v.name, last_seen = now() where id = m.id returning * into m;
  end if;
  update public.tw_sessions set org_id = o.id, member_id = m.id where token_hash = s.token_hash;
  return jsonb_build_object('org', jsonb_build_object('id',o.id,'name',o.name), 'member', jsonb_build_object('id',m.id,'name',m.display_name,'email',m.email));
end $$;

create or replace function public.tw_org_join_code(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare s public.tw_sessions; o public.tw_orgs;
begin
  s := public.tw_auth(p_token);
  if s.token_hash is null or s.role <> 'org' or s.org_id is null then return jsonb_build_object('error','Session expired. Please sign in again.'); end if;
  select * into o from public.tw_orgs where id = s.org_id;
  return jsonb_build_object('code', o.join_code);
end $$;

revoke all on function public.tw_join_org_code(text, uuid, text), public.tw_org_join_code(text) from public, anon, authenticated;
grant execute on function public.tw_join_org_code(text, uuid, text), public.tw_org_join_code(text) to anon, service_role;
revoke execute on function public.tw_join_org(text, uuid) from anon;
