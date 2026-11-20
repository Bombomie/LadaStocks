-- ============================================================
-- avatar_migration.sql — run once in the Supabase SQL Editor.
--
-- Adds the profile-picture column used by the Cloudinary upload
-- feature on the user profile page.
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- No new RLS policy needed: the existing
--   "Users can update own profile"  (FOR UPDATE USING (auth.uid() = user_id))
-- already covers the new column, and the backend only ever writes a
-- res.cloudinary.com URL into it.

-- Optional safety net: reject non-Cloudinary values directly in the DB,
-- even if someone bypasses the API.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_avatar_url_cloudinary_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_avatar_url_cloudinary_check
  CHECK (avatar_url IS NULL OR avatar_url LIKE 'https://res.cloudinary.com/%');
