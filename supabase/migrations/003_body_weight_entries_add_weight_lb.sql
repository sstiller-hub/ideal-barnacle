alter table public.body_weight_entries
  add column if not exists weight_lb numeric;
