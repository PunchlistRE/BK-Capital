-- BK Capital V36: DRAFT. Deal sharing with roles. NOT APPLIED and not run by the app: it waits for the owner's approval.
-- Additive only (a new table and its policies; nothing existing is altered or dropped). Safe to run again.
-- Roles: viewer (read), commenter (read, comment), editor (read, edit, comment). The owner is the deal's creator and needs no row.
-- Enforcing these roles on public.deals itself needs policies written against that table's ownership column, which this draft does not assume; review before running.

create table if not exists public.deal_shares (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  shared_with_email text not null,
  role text not null check (role in ('viewer', 'commenter', 'editor')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (deal_id, shared_with_email)
);
alter table public.deal_shares enable row level security;

drop policy if exists "deal shares: owner manages" on public.deal_shares;
drop policy if exists "deal shares: invitee reads own" on public.deal_shares;
create policy "deal shares: owner manages" on public.deal_shares for all to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "deal shares: invitee reads own" on public.deal_shares for select to authenticated
  using (lower(shared_with_email) = lower(auth.jwt() ->> 'email'));
