-- Remover policies antigas
DROP POLICY IF EXISTS "Users can insert own leads" ON public.leads_prospeccao;

-- Criar policy de INSERT mais permissiva
CREATE POLICY "Users can insert own leads"
  ON public.leads_prospeccao FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Verificar se a função trigger está correta
CREATE OR REPLACE FUNCTION public.set_user_id_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Se user_id não foi fornecido, pegar do usuário autenticado
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  
  -- Permitir inserção se o user_id bate com o usuário autenticado
  IF NEW.user_id = auth.uid() THEN
    RETURN NEW;
  END IF;
  
  -- Bloquear se tentar inserir para outro usuário
  RAISE EXCEPTION 'Você não pode criar leads para outro usuário';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
