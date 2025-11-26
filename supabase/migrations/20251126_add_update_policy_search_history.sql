-- Add UPDATE policy for search_history table
-- This allows users to update their own search history records

DROP POLICY IF EXISTS "Users can update own history" ON public.search_history;
CREATE POLICY "Users can update own history"
  ON public.search_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add comment
COMMENT ON POLICY "Users can update own history" ON public.search_history
IS 'Permite que usuários atualizem apenas seu próprio histórico de buscas';
