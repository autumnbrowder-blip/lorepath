-- Hardening: ensure users can update their own preferences on upsert,
-- and that WITH CHECK matches USING (needed for INSERT ... ON CONFLICT DO UPDATE).

drop policy if exists "Users can update own preferences" on public.user_preferences;

create policy "Users can update own preferences"
  on public.user_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Also re-assert select/insert/delete so a partial policy setup cannot hide rows.
drop policy if exists "Users can view own preferences" on public.user_preferences;
create policy "Users can view own preferences"
  on public.user_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own preferences" on public.user_preferences;
create policy "Users can insert own preferences"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own preferences" on public.user_preferences;
create policy "Users can delete own preferences"
  on public.user_preferences for delete
  using (auth.uid() = user_id);
