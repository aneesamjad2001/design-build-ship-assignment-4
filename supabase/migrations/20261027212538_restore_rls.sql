-- Undo the previous migration: each person reads only their own saved exercises again.
drop policy "read own rows" on public.saved_exercises;
create policy "read own rows" on public.saved_exercises for select to authenticated
  using (user_id = (select public.requesting_user_id()));
