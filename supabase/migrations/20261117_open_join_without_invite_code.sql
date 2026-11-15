-- Joining an organization no longer asks for an invite code, so the original join function is allowed again.
-- (Already applied to the live project. The invite-code functions from 20261116 are left in place but unused.)
grant execute on function public.tw_join_org(text, uuid) to anon;
