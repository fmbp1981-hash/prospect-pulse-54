
-- Migration: Create lead_interactions and lead_notes tables
-- Also adds indexes to whatsapp_conversations and RLS policies for n8n access

-- ============================================
-- 1. Create lead_interactions table
-- ============================================
CREATE TABLE IF NOT EXISTS public.lead_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. Create lead_notes table
-- ============================================
CREATE TABLE IF NOT EXISTS public.lead_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id TEXT NOT NULL,
    content TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id ON public.lead_interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_created_at ON public.lead_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON public.lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at ON public.lead_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_lead_id ON public.whatsapp_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_timestamp ON public.whatsapp_conversations(timestamp DESC);

-- ============================================
-- 4. Enable RLS
-- ============================================
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. RLS policies - lead_interactions
-- ============================================
DROP POLICY IF EXISTS "Users can view their own lead interactions" ON public.lead_interactions;
CREATE POLICY "Users can view their own lead interactions" ON public.lead_interactions
    FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert lead interactions" ON public.lead_interactions;
CREATE POLICY "Users can insert lead interactions" ON public.lead_interactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role full access to lead_interactions" ON public.lead_interactions;
CREATE POLICY "Service role full access to lead_interactions" ON public.lead_interactions
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 6. RLS policies - lead_notes
-- ============================================
DROP POLICY IF EXISTS "Users can view their own lead notes" ON public.lead_notes;
CREATE POLICY "Users can view their own lead notes" ON public.lead_notes
    FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert lead notes" ON public.lead_notes;
CREATE POLICY "Users can insert lead notes" ON public.lead_notes
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own lead notes" ON public.lead_notes;
CREATE POLICY "Users can update their own lead notes" ON public.lead_notes
    FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own lead notes" ON public.lead_notes;
CREATE POLICY "Users can delete their own lead notes" ON public.lead_notes
    FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role full access to lead_notes" ON public.lead_notes;
CREATE POLICY "Service role full access to lead_notes" ON public.lead_notes
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 7. RLS policies - whatsapp_conversations (for n8n anon key access)
-- ============================================
DROP POLICY IF EXISTS "Anon can insert whatsapp conversations" ON public.whatsapp_conversations;
CREATE POLICY "Anon can insert whatsapp conversations" ON public.whatsapp_conversations
    FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anon can read whatsapp conversations" ON public.whatsapp_conversations;
CREATE POLICY "Anon can read whatsapp conversations" ON public.whatsapp_conversations
    FOR SELECT USING (true);

-- ============================================
-- 8. Create transfer_logs table (used by transferir_para_consultor tool)
-- ============================================
CREATE TABLE IF NOT EXISTS public.transfer_logs (
    id SERIAL PRIMARY KEY,
    lead_whatsapp TEXT,
    lead_nome TEXT,
    consultor TEXT,
    timestamp TIMESTAMPTZ DEFAULT now(),
    banco_atualizado BOOLEAN DEFAULT false,
    consultor_notificado BOOLEAN DEFAULT false,
    metodo TEXT
);

CREATE INDEX IF NOT EXISTS idx_transfer_logs_timestamp ON public.transfer_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_logs_lead_whatsapp ON public.transfer_logs(lead_whatsapp);

-- Allow anon key (used by n8n) to insert transfer logs
ALTER TABLE public.transfer_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anon can insert transfer logs" ON public.transfer_logs;
CREATE POLICY "Anon can insert transfer logs" ON public.transfer_logs
    FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anon can read transfer logs" ON public.transfer_logs;
CREATE POLICY "Anon can read transfer logs" ON public.transfer_logs
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to transfer_logs" ON public.transfer_logs;
CREATE POLICY "Service role full access to transfer_logs" ON public.transfer_logs
    FOR ALL USING (auth.role() = 'service_role');