import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "EXPORT_LEADS"
  | "WHATSAPP_DISPATCH"
  | "START_PROSPECTION"
  | "BULK_DELETE_LEADS"
  | "LOGIN"
  | "LOGOUT"
  | "SETTINGS_CHANGE"
  | "WEBHOOK_KEY_CREATE"
  | "WEBHOOK_KEY_DELETE"
  | "IMPORT_LEADS"
  | "ROLE_CHANGE";

export interface AuditLog {
  action: AuditAction;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, unknown>;
}

export const logAudit = async (log: AuditLog): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.warn('[AUDIT] Usuário não autenticado, log não salvo');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('audit_logs')
      .insert({
        user_id: user.id,
        user_email: user.email ?? null,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id ?? null,
        details: log.details ?? null,
        ip_address: null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });

    if (error) {
      if (error.code !== 'PGRST205') {
        console.warn('[AUDIT] Erro ao salvar log:', error.message);
      }
      const localLogs: unknown[] = JSON.parse(localStorage.getItem('audit_logs_fallback') ?? '[]');
      localLogs.push({ timestamp: new Date().toISOString(), user_id: user.id, user_email: user.email, ...log });
      if (localLogs.length > 100) localLogs.shift();
      localStorage.setItem('audit_logs_fallback', JSON.stringify(localLogs));
    }
  } catch (err) {
    console.error("[AUDIT] Erro ao registrar log:", err);
  }
};

export const getAuditLogs = async (limit: number = 100, action?: AuditAction) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (action) {
      query = query.eq('action', action);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.error('[AUDIT] Erro ao buscar logs:', err);
    return [];
  }
};

// Helpers específicos
export const auditExport = (leadCount: number, format: string) =>
  logAudit({ action: "EXPORT_LEADS", entity_type: "lead", details: { leadCount, format } });

export const auditWhatsAppDispatch = (leadIds: string[], successCount: number, failedCount: number) =>
  logAudit({ action: "WHATSAPP_DISPATCH", entity_type: "lead", details: { leadIds, successCount, failedCount, total: leadIds.length } });

export const auditProspection = (niche: string, location: Record<string, unknown>, quantity: number) =>
  logAudit({ action: "START_PROSPECTION", entity_type: "prospection", details: { niche, location, quantity } });

export const auditBulkDelete = (leadIds: string[]) =>
  logAudit({ action: "BULK_DELETE_LEADS", entity_type: "lead", details: { leadIds, count: leadIds.length } });

export const auditLogin = (email: string) =>
  logAudit({ action: "LOGIN", entity_type: "auth", details: { email } });

export const auditLogout = () =>
  logAudit({ action: "LOGOUT", entity_type: "auth" });

export const auditSettingsChange = (section: string, changes: Record<string, unknown>) =>
  logAudit({ action: "SETTINGS_CHANGE", entity_type: "settings", details: { section, changes } });

export const auditWebhookKeyCreate = (keyId: string, name: string) =>
  logAudit({ action: "WEBHOOK_KEY_CREATE", entity_type: "webhook_key", entity_id: keyId, details: { name } });

export const auditWebhookKeyDelete = (keyId: string, name: string) =>
  logAudit({ action: "WEBHOOK_KEY_DELETE", entity_type: "webhook_key", entity_id: keyId, details: { name } });

export const auditImportLeads = (count: number, source: string) =>
  logAudit({ action: "IMPORT_LEADS", entity_type: "lead", details: { count, source } });

export const auditRoleChange = (targetUserId: string, oldRole: string, newRole: string) =>
  logAudit({ action: "ROLE_CHANGE", entity_type: "user", entity_id: targetUserId, details: { oldRole, newRole } });
