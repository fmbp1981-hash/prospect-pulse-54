/**
 * Repositório de prospecting_jobs — fila de jobs de prospecção (LinkedIn
 * hoje). O worker atual é síncrono (run-sync-get-dataset-items do Apify já
 * bloqueia até terminar), então o job nasce e termina na mesma chamada —
 * mas fica registrado para auditoria e para uma futura versão assíncrona.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';

type ProspectingJobRow = Database['public']['Tables']['prospecting_jobs']['Row'];
type ProspectingJobInsert = Database['public']['Tables']['prospecting_jobs']['Insert'];
type ProspectingJobUpdate = Database['public']['Tables']['prospecting_jobs']['Update'];

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

export const prospectingJobsRepository = {
  async create(userId: string, params: Json): Promise<ProspectingJobRow> {
    const supabase = getServiceClient();
    const fields: ProspectingJobInsert = {
      user_id: userId,
      channel: 'LinkedIn',
      job_type: 'search_people',
      status: 'running',
      params,
    };
    const { data, error } = await supabase.from('prospecting_jobs').insert(fields).select().single();
    if (error) throw new Error(`prospectingJobs.create: ${error.message}`);
    return data;
  },

  async complete(id: string, fields: ProspectingJobUpdate): Promise<void> {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from('prospecting_jobs')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`prospectingJobs.complete: ${error.message}`);
  },
};
