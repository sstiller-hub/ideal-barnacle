-- User profile fields for protected gym barcode
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gym_barcode_path text,
  updated_at timestamptz default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own"
  on public.user_profiles for select
  using (user_id = auth.uid());

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
  on public.user_profiles for insert
  with check (user_id = auth.uid());

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
  on public.user_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_profiles_delete_own" on public.user_profiles;
create policy "user_profiles_delete_own"
  on public.user_profiles for delete
  using (user_id = auth.uid());

-- Storage bucket for protected user assets
insert into storage.buckets (id, name, public)
values ('user-assets', 'user-assets', false)
on conflict (id) do nothing;

-- Storage policies for user-owned objects in the bucket
drop policy if exists "user_assets_insert_own" on storage.objects;
create policy "user_assets_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'user-assets' and auth.uid() = owner);

drop policy if exists "user_assets_update_own" on storage.objects;
create policy "user_assets_update_own"
  on storage.objects for update
  using (bucket_id = 'user-assets' and auth.uid() = owner);

drop policy if exists "user_assets_delete_own" on storage.objects;
create policy "user_assets_delete_own"
  on storage.objects for delete
  using (bucket_id = 'user-assets' and auth.uid() = owner);
