import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Lead } from "@/types/prospection";
import { supabaseCRM } from "@/lib/supabaseCRM";
import { auditWhatsAppDispatch } from "@/lib/audit";
import { toast } from "sonner";

interface DispatchStatus {
  leadId: string;
  leadName: string;
  message?: string; // Preview da mensagem
  status: "pending" | "sending" | "sent" | "failed";
  error?: string;
}

interface WhatsAppDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLeads: Lead[];
}

export const WhatsAppDispatchModal = ({ 
  isOpen, 
  onClose, 
  selectedLeads 
}: WhatsAppDispatchModalProps) => {
  const [statuses, setStatuses] = useState<DispatchStatus[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);

  // Filtrar leads válidos (com WhatsApp, mensagem e não enviados)
  const validLeads = selectedLeads.filter(lead => 
    lead.whatsapp && 
    lead.whatsapp.trim() !== "" &&
    lead.mensagemWhatsApp && 
    lead.mensagemWhatsApp.trim() !== "" &&
    lead.statusMsgWA !== 'sent'
  );
  const leadsWithoutWhatsApp = selectedLeads.filter(lead => 
    !lead.whatsapp || lead.whatsapp.trim() === ""
  );
  const leadsWithoutMessage = selectedLeads.filter(lead => 
    lead.whatsapp && lead.whatsapp.trim() !== "" && !lead.mensagemWhatsApp
  );
  const alreadySent = selectedLeads.filter(lead => lead.statusMsgWA === 'sent');

  useEffect(() => {
    if (isOpen && validLeads.length > 0) {
      setStatuses(
        validLeads.map(lead => ({
          leadId: lead.id,
          leadName: lead.lead,
          message: lead.mensagemWhatsApp,
          status: "pending" as const
        }))
      );
    }
  }, [isOpen, validLeads]);

  const handleDispatch = async () => {
    if (isDispatching || validLeads.length === 0) {
      toast.error("Nenhum lead válido para enviar", {
        description: "Verifique se os leads possuem WhatsApp e mensagem configurados"
      });
      return;
    }
    
    // Verificar se webhook está configurado
    const whatsappWebhook = localStorage.getItem("whatsapp_webhook_url");
    if (!whatsappWebhook) {
      toast.error("Configure o webhook WhatsApp nas Configurações da sidebar");
      return;
    }
    
    setIsDispatching(true);

    // Processar leads sequencialmente
    for (let i = 0; i < validLeads.length; i++) {
      const lead = validLeads[i];
      
      // Validação extra antes de enviar
      if (!lead.whatsapp || lead.whatsapp.trim() === "") {
        setStatuses(prev => prev.map(s => 
          s.leadId === lead.id 
            ? { ...s, status: "failed", error: "WhatsApp não coletado" } 
            : s
        ));
        continue;
      }
      
      setStatuses(prev => prev.map(s => 
        s.leadId === lead.id ? { ...s, status: "sending" } : s
      ));

      try {
        // Enviar para webhook n8n com Evolution API
        const response = await fetch(whatsappWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            whatsapp: lead.whatsapp,
            message: lead.mensagemWhatsApp,
            leadName: lead.lead,
            empresa: lead.empresa,
          }),
        });

        if (!response.ok) {
          throw new Error(`Webhook retornou ${response.status}`);
        }

        const result = await response.json();
        const isSuccess = result.success === true;
        
        // Atualizar status no Supabase
        if (isSuccess) {
          await supabaseCRM.updateLead(lead.id, {
            statusMsgWA: "sent",
            dataEnvioWA: new Date().toISOString(),
          });
        }
        
        setStatuses(prev => prev.map(s => 
          s.leadId === lead.id 
            ? { 
                ...s, 
                status: isSuccess ? "sent" : "failed", 
                error: isSuccess ? undefined : result.error || result.message
              } 
            : s
        ));
        
        // Delay entre envios
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        setStatuses(prev => prev.map(s => 
          s.leadId === lead.id 
            ? { ...s, status: "failed", error: String(error) } 
            : s
        ));
      }
    }

    // Log de auditoria
    const sentCount = statuses.filter(s => s.status === "sent").length;
    const failedCount = statuses.filter(s => s.status === "failed").length;
    await auditWhatsAppDispatch(validLeads.map(l => l.id), sentCount, failedCount);

    setIsDispatching(false);
  };

  const progress = statuses.length > 0 
    ? (statuses.filter(s => s.status === "sent" || s.status === "failed").length / statuses.length) * 100 
    : 0;
  const sentCount = statuses.filter(s => s.status === "sent").length;
  const failedCount = statuses.filter(s => s.status === "failed").length;
  const isComplete = progress === 100;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Envio de Mensagens WhatsApp</DialogTitle>
        </DialogHeader>

        {/* Avisos */}
        {(leadsWithoutWhatsApp.length > 0 || leadsWithoutMessage.length > 0 || alreadySent.length > 0) && (
          <div className="space-y-2">
            {leadsWithoutWhatsApp.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900">
                      {leadsWithoutWhatsApp.length} lead(s) sem número de WhatsApp coletado
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      Estes leads não receberão mensagens:
                    </p>
                    <ul className="text-xs text-red-600 mt-2 space-y-1 max-h-24 overflow-y-auto">
                      {leadsWithoutWhatsApp.map(lead => (
                        <li key={lead.id}>• {lead.lead} ({lead.empresa})</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            {leadsWithoutMessage.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-900">
                      {leadsWithoutMessage.length} lead(s) sem mensagem configurada
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Configure a mensagem no CRM antes de enviar:
                    </p>
                    <ul className="text-xs text-yellow-600 mt-2 space-y-1 max-h-24 overflow-y-auto">
                      {leadsWithoutMessage.map(lead => (
                        <li key={lead.id}>• {lead.lead}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            {alreadySent.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900">
                      {alreadySent.length} lead(s) já receberam mensagem anteriormente
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      Estes leads serão ignorados para evitar envio duplicado
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {validLeads.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum lead válido para envio de mensagens.
          </div>
        ) : (
          <>
            {/* Progress Bar */}
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span className="text-success font-medium">{sentCount} enviados</span>
                <span className="text-destructive font-medium">{failedCount} falhas</span>
                <span>{validLeads.length} total</span>
              </div>
            </div>

            {/* Lista de status */}
            <div className="space-y-2 overflow-y-auto flex-1 pr-2">
              {statuses.map(status => (
                <div 
                  key={status.leadId}
                  className="flex flex-col gap-1 p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate flex-1">{status.leadName}</span>
                    
                    {status.status === "pending" && (
                      <Badge variant="outline">Aguardando</Badge>
                    )}
                    {status.status === "sending" && (
                      <Badge variant="secondary" className="gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Enviando...
                      </Badge>
                    )}
                    {status.status === "sent" && (
                      <Badge className="gap-2 bg-success hover:bg-success/90">
                        <CheckCircle2 className="h-3 w-3" />
                        Enviado
                      </Badge>
                    )}
                    {status.status === "failed" && (
                      <Badge variant="destructive" className="gap-2">
                        <XCircle className="h-3 w-3" />
                        Falha
                      </Badge>
                    )}
                  </div>
                  
                  {/* Preview da mensagem */}
                  {status.message && (
                    <p className="text-xs text-muted-foreground truncate">
                      📱 {status.message.substring(0, 60)}...
                    </p>
                  )}
                  
                  {/* Erro se houver */}
                  {status.error && status.status === "failed" && (
                    <p className="text-xs text-destructive">
                      ⚠️ {status.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Botão de ação */}
        <div className="flex gap-2 pt-4 border-t">
          {isComplete ? (
            <Button onClick={onClose} className="w-full">
              Fechar
            </Button>
          ) : (
            <>
              <Button 
                variant="outline"
                onClick={onClose} 
                disabled={isDispatching}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleDispatch}
                disabled={isDispatching || validLeads.length === 0}
                className="flex-1"
              >
                {isDispatching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  `Enviar para ${validLeads.length} lead(s)`
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
