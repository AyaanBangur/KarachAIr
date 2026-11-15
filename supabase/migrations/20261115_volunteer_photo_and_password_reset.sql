-- KarachAir: volunteer profile photo, organization email, password reset (volunteers and organizations).
-- Additive only: new columns, one new table, new functions. Existing functions are untouched.
-- (Already applied to the live project as "karachair_photo_org_email_password_reset".)
alter table public.tw_volunteers add column if not exists photo text, add column if not exists photo_never boolean not null default false;
alter table public.tw_orgs add column if not exists email text, add column if not exists email_key text;

create table if not exists public.tw_password_resets (
  token_hash text primary key,
  kind text not null check (kind in ('volunteer','org')),
  volunteer_id uuid references public.tw_volunteers(id) on delete cascade,
  org_id uuid references public.tw_orgs(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.tw_password_resets enable row level security;
revoke all on public.tw_password_resets from anon, authenticated;

create or replace function public.tw_get_profile(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare s public.tw_sessions; v public.tw_volunteers;
begin
  s := public.tw_auth(p_token);
  if s.token_hash is null or s.volunteer_id is null then return jsonb_build_object('error','Session expired. Please sign in again.'); end if;
  select * into v from public.tw_volunteers where id = s.volunteer_id;
  return jsonb_build_object('photo', v.photo, 'never', v.photo_never);
end $$;

-- p_photo: null = leave as is, '' = remove, otherwise a small image data URL. p_never: null = leave as is.
create or replace function public.tw_set_profile(p_token text, p_photo text, p_never boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare s public.tw_sessions;
begin
  s := public.tw_auth(p_token);
  if s.token_hash is null or s.volunteer_id is null then return jsonb_build_object('error','Session expired. Please sign in again.'); end if;
  if p_photo is not null and p_photo <> '' and (p_photo !~ '^data:image/(jpeg|png|webp);base64,' or char_length(p_photo) > 120000) then
    return jsonb_build_object('error','That photo is not a supported image, or it is too large.');
  end if;
  update public.tw_volunteers set
    photo = case when p_photo is null then photo when p_photo = '' then null else p_photo end,
    photo_never = coalesce(p_never, photo_never)
  where id = s.volunteer_id;
  return jsonb_build_object('ok', true);
end $$;

-- an organization records the email its password reset links are sent to
create or replace function public.tw_set_org_email(p_token text, p_email text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare s public.tw_sessions; v_email text := btrim(coalesce(p_email,''));
begin
  s := public.tw_auth(p_token);
  if s.token_hash is null or s.role <> 'org' or s.org_id is null then return jsonb_build_object('error','Session expired. Please sign in again.'); end if;
  if char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('error','Enter a valid email address.'); end if;
  update public.tw_orgs set email = v_email, email_key = lower(v_email) where id = s.org_id;
  return jsonb_build_object('ok', true);
end $$;

-- called only by the request-password-reset Edge Function (service role). Volunteers: by email. Organizations: by name + email.
create or replace function public.tw_create_reset(p_email text, p_org_name text default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v public.tw_volunteers; o public.tw_orgs; tok text := public.tw_new_token(); v_email text := lower(btrim(coalesce(p_email,'')));
begin
  if btrim(coalesce(p_org_name,'')) <> '' then
    select * into o from public.tw_orgs where name_key = lower(btrim(p_org_name)) and email_key = v_email;
    if not found then return jsonb_build_object('found', false); end if;
    if (select count(*) from public.tw_password_resets where org_id = o.id and created_at > now() - interval '1 hour') >= 3 then return jsonb_build_object('found', true, 'limited', true); end if;
    insert into public.tw_password_resets(token_hash, kind, org_id, expires_at) values (public.tw_sha(tok), 'org', o.id, now() + interval '1 hour');
    return jsonb_build_object('found', true, 'kind', 'org', 'token', tok, 'email', o.email, 'name', o.name);
  end if;
  select * into v from public.tw_volunteers where email_key = v_email;
  if not found then return jsonb_build_object('found', false); end if;
  if (select count(*) from public.tw_password_resets where volunteer_id = v.id and created_at > now() - interval '1 hour') >= 3 then return jsonb_build_object('found', true, 'limited', true); end if;
  insert into public.tw_password_resets(token_hash, kind, volunteer_id, expires_at) values (public.tw_sha(tok), 'volunteer', v.id, now() + interval '1 hour');
  return jsonb_build_object('found', true, 'kind', 'volunteer', 'token', tok, 'email', v.email, 'name', v.name);
end $$;

-- the reset link page calls this with the token from the email and the new password / passcode
create or replace function public.tw_reset_password(p_token text, p_pass text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare r public.tw_password_resets; v_salt text := public.tw_new_token();
begin
  if char_length(coalesce(p_pass,'')) < 8 then return jsonb_build_object('error','Password must be at least 8 characters.'); end if;
  select * into r from public.tw_password_resets where token_hash = public.tw_sha(coalesce(p_token,'')) and used_at is null and expires_at > now();
  if not found then return jsonb_build_object('error','This reset link has expired or was already used. Please request a new one.'); end if;
  if r.kind = 'org' then
    update public.tw_orgs set pass_salt = v_salt, pass_hash = public.tw_hash_pass(p_pass, v_salt), fail_count = 0, locked_until = null where id = r.org_id;
    delete from public.tw_sessions where org_id = r.org_id and role = 'org';
  else
    update public.tw_volunteers set pass_salt = v_salt, pass_hash = public.tw_hash_pass(p_pass, v_salt), fail_count = 0, locked_until = null where id = r.volunteer_id;
    delete from public.tw_sessions where volunteer_id = r.volunteer_id;
  end if;
  update public.tw_password_resets set used_at = now() where token_hash = r.token_hash;
  return jsonb_build_object('ok', true, 'kind', r.kind);
end $$;

revoke all on function public.tw_get_profile(text), public.tw_set_profile(text, text, boolean), public.tw_set_org_email(text, text), public.tw_create_reset(text, text), public.tw_reset_password(text, text) from public, anon, authenticated;
grant execute on function public.tw_get_profile(text), public.tw_set_profile(text, text, boolean), public.tw_set_org_email(text, text), public.tw_reset_password(text, text) to anon, service_role;
grant execute on function public.tw_create_reset(text, text) to service_role;
