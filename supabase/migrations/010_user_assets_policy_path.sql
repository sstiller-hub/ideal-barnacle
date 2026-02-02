-- Restrict user-assets uploads to user-owned paths under barcodes/
drop policy if exists "user_assets_insert_own" on storage.objects;
create policy "user_assets_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'user-assets'
    and auth.uid() is not null
    and split_part(name, '/', 1) = 'barcodes'
    and split_part(name, '/', 2) like auth.uid()::text || '%'
  );

drop policy if exists "user_assets_update_own" on storage.objects;
create policy "user_assets_update_own"
  on storage.objects for update
  using (
    bucket_id = 'user-assets'
    and auth.uid() is not null
    and split_part(name, '/', 1) = 'barcodes'
    and split_part(name, '/', 2) like auth.uid()::text || '%'
  );

drop policy if exists "user_assets_delete_own" on storage.objects;
create policy "user_assets_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'user-assets'
    and auth.uid() is not null
    and split_part(name, '/', 1) = 'barcodes'
    and split_part(name, '/', 2) like auth.uid()::text || '%'
  );
