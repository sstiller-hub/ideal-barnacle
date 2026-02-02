-- Restrict user-assets uploads to user-owned paths: barcodes/{user_id}/...
drop policy if exists "user_assets_insert_own" on storage.objects;
create policy "user_assets_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'user-assets'
    and auth.uid() is not null
    and storage.foldername(name) is not null
    and array_length(storage.foldername(name), 1) >= 2
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "user_assets_update_own" on storage.objects;
create policy "user_assets_update_own"
  on storage.objects for update
  using (
    bucket_id = 'user-assets'
    and auth.uid() is not null
    and storage.foldername(name) is not null
    and array_length(storage.foldername(name), 1) >= 2
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "user_assets_delete_own" on storage.objects;
create policy "user_assets_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'user-assets'
    and auth.uid() is not null
    and storage.foldername(name) is not null
    and array_length(storage.foldername(name), 1) >= 2
    and (storage.foldername(name))[2] = auth.uid()::text
  );
