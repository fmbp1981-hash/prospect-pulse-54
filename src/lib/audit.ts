import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export interface AuditLog {
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, any>;
}

export const logAudit = async (log: AuditLog) => {
  try {
    // Log no console (desenvolvimento)
    console.log('[AUDIT]', {
      timestamp: new Date().toISOString(),
      ...log
    });

    // Obter user_id atual
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.warn('[AUDIT] Usuário não autenticado, log não salvo');
      return;
    }

    // Salvar no Supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('audit_logs')
      .insert({
        user_id: user.id,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        details: log.details,
        ip_address: null, // Pode ser obtido via API externa se necessário
        user_agent: navigator.userAgent,
      });

    if (error) {
      // Silenciar erro PGRST205 (tabela não existe) - é esperado se audit_logs não foi criada
      if (error.code !== 'PGRST205') {
        console.warn('[AUDIT] Erro ao salvar log:', error.message || error);
      }
      // Fallback: salvar no localStorage se Supabase falhar
      const localLogs = JSON.parse(localStorage.getItem('audit_logs_fallback') || '[]');
      localLogs.push({
        timestamp: new Date().toISOString(),
        user_id: user.id,
        ...log
      });
      if (localLogs.length > 100) localLogs.shift();
      localStorage.setItem('audit_logs_fallback', JSON.stringify(localLogs));
    }
  } catch (error) {
    console.error("[AUDIT] Erro ao registrar log de auditoria:", error);
  }
};

// Função para buscar logs de auditoria do usuário atual
export const getAuditLogs = async (limit: number = 100) => {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[AUDIT] Erro ao buscar logs:', error);
    return [];
  }
};

// Funções específicas
export const auditExport = (leadCount: number, format: string) => {
  logAudit({
    action: "EXPORT_LEADS",
    entity_type: "lead",
    details: { leadCount, format },
  });
};

export const auditWhatsAppDispatch = (leadIds: string[], successCount: number, failedCount: number) => {
  logAudit({
    action: "WHATSAPP_DISPATCH",
    entity_type: "lead",
    details: { leadIds, successCount, failedCount, total: leadIds.length },
  });
};

export const auditProspection = (niche: string, location: any, quantity: number) => {
  logAudit({
    action: "START_PROSPECTION",
    entity_type: "prospection",
    details: { niche, location, quantity },
  });
};

export const auditBulkDelete = (leadIds: string[]) => {
  logAudit({
    action: "BULK_DELETE_LEADS",
    entity_type: "lead",
    details: { leadIds, count: leadIds.length },
  });
};
