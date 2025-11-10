export interface AuditLog {
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, any>;
}

export const logAudit = async (log: AuditLog) => {
  try {
    // Por enquanto, apenas log no console
    // Em produção, isso seria enviado para um endpoint de auditoria
    console.log('[AUDIT]', {
      timestamp: new Date().toISOString(),
      ...log
    });
    
    // Armazenar no localStorage para histórico local
    const logs = JSON.parse(localStorage.getItem('audit_logs') || '[]');
    logs.push({
      timestamp: new Date().toISOString(),
      ...log
    });
    
    // Manter apenas os últimos 100 logs
    if (logs.length > 100) {
      logs.shift();
    }
    
    localStorage.setItem('audit_logs', JSON.stringify(logs));
  } catch (error) {
    console.error("Erro ao registrar log de auditoria:", error);
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
