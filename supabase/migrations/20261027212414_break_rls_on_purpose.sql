-- ON PURPOSE, for the assignment's "watch the test fail" step: any signed-in person can
-- read everyone's saved exercises. Undone by the next migration a few minutes later.
drop policy "read own rows" on public.saved_exercises;
create policy "read own rows" on public.saved_exercises for select to authenticated
  using (true);
