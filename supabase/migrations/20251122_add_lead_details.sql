-- Add tags column to leads_prospeccao
ALTER TABLE public.leads_prospeccao ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Create lead_notes table
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads_prospeccao(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for lead_notes
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

-- Policies for lead_notes
CREATE POLICY "Users can view notes" ON public.lead_notes FOR SELECT USING (true);
CREATE POLICY "Users can insert notes" ON public.lead_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update notes" ON public.lead_notes FOR UPDATE USING (true);
CREATE POLICY "Users can delete notes" ON public.lead_notes FOR DELETE USING (true);

-- Create lead_interactions table (History)
CREATE TABLE IF NOT EXISTS public.lead_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads_prospeccao(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'status_change', 'whatsapp_sent', 'note_added', 'manual_log'
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for lead_interactions
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;

-- Policies for lead_interactions
CREATE POLICY "Users can view interactions" ON public.lead_interactions FOR SELECT USING (true);
CREATE POLICY "Users can insert interactions" ON public.lead_interactions FOR INSERT WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON public.lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id ON public.lead_interactions(lead_id);
