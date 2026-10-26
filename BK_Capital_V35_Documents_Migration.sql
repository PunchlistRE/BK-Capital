-- BK Capital V35: private storage for Deal Documents (photo, OM, T-12, CoStar, listing, other).
-- Run once in the Supabase SQL editor. Safe to run again.
-- Each signed-in user can only read and write files under a folder named with their own user id.

insert into storage.buckets (id, name, public, file_size_limit)
values ('deal-documents', 'deal-documents', false, 47185920)
on conflict (id) do update set public = false, file_size_limit = 47185920;

drop policy if exists "deal documents: read own" on storage.objects;
drop policy if exists "deal documents: insert own" on storage.objects;
drop policy if exists "deal documents: update own" on storage.objects;
drop policy if exists "deal documents: delete own" on storage.objects;

create policy "deal documents: read own" on storage.objects for select to authenticated
  using (bucket_id = 'deal-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "deal documents: insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'deal-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "deal documents: update own" on storage.objects for update to authenticated
  using (bucket_id = 'deal-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'deal-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "deal documents: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'deal-documents' and (storage.foldername(name))[1] = auth.uid()::text);
