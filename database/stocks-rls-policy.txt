-- Allow anyone (including the backend with user session) to view stocks
CREATE POLICY "Anyone can view stocks" ON public.stocks FOR SELECT USING (true);

-- Allow authenticated users to insert new stock records
CREATE POLICY "Authenticated can insert stocks" ON public.stocks FOR INSERT TO authenticated WITH CHECK (true);

-- Allow updates (for sector/exchange enrichment)
CREATE POLICY "Authenticated can update stocks" ON public.stocks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);