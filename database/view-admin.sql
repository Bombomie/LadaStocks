CREATE POLICY "Admins can view own admin row"
ON public.admins
FOR SELECT
TO authenticated
USING (auth.uid() = auth_user_id);