-- let admins sign in through Supabase Auth instead of their own password
ALTER TABLE public.admins
  ALTER COLUMN password_hash DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE
    REFERENCES auth.users(id) ON DELETE CASCADE;

-- make ladajules@gmail.com an admin
INSERT INTO public.admins (username, email, role, auth_user_id)
SELECT 'ladajules', email, 'admin', id
FROM auth.users
WHERE email = 'ladajules@gmail.com';