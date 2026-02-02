-- Allow authenticated users to upload to user-assets even if owner is null on insert
drop policy if exists "user_assets_insert_own" on storage.objects;
create policy "user_assets_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'user-assets'
    and auth.uid() is not null
    and (owner = auth.uid() or owner is null)
  );
