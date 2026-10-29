-- Add target_price column to watchlist_items
ALTER TABLE public.watchlist_items
ADD COLUMN IF NOT EXISTS target_price numeric(12,4);

-- Allow users to update their own watchlist items (for target_price)
CREATE POLICY "Users can update own watchlist"
ON public.watchlist_items
FOR UPDATE
USING (auth.uid() = user_id);