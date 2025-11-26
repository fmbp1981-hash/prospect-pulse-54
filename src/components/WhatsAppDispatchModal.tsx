import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Lead } from "@/types/prospection";
import { supabaseCRM } from "@/lib/supabaseCRM";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
  const { user } = useAuth();
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [editedMessage, setEditedMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [whatsappWebhook, setWhatsappWebhook] = useState<string | null>(null);

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

  // Initialize edited message when opening for a single lead
  useEffect(() => {
    if (isOpen && validLeads.length === 1) {
      setEditedMessage(validLeads[0].mensagemWhatsApp || "");
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
  }, [isOpen, validLeads.length]);

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

  // Carregar webhook do Supabase quando modal abrir
  useEffect(() => {
    const loadWebhook = async () => {
      if (!isOpen || !user?.id) return;

      const { data, error } = await supabase
        .from('user_settings')
        .select('whatsapp_webhook_url')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Erro ao carregar webhook:', error);
        return;
      }

      setWhatsappWebhook(data?.whatsapp_webhook_url || null);
    };

    loadWebhook();
  }, [isOpen, user?.id]);

  const handleTestSend = async () => {
    if (validLeads.length === 0) {
      toast.error("Nenhum lead válido para teste");
      return;
    }

    if (!testPhoneNumber.trim()) {
      toast.error("Digite um número de WhatsApp para teste");
      return;
    }

    if (!whatsappWebhook) {
      toast.error("Configure o webhook WhatsApp nas Configurações da sidebar");
      return;
    }

    setTestMode(true);
    setIsDispatching(true);
    setShowTestConfirm(false);

    const testLead = validLeads[0]; // Apenas o primeiro lead
    // Use edited message if available and we are in single mode, otherwise use lead's message
    const messageToSend = (isEditing && editedMessage) ? editedMessage : testLead.mensagemWhatsApp;

    setStatuses([{
      leadId: testLead.id,
      leadName: testLead.lead,
      message: messageToSend,
      status: "sending"
    }]);

    try {
      const response = await fetch(whatsappWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: testLead.id,
          whatsapp: testPhoneNumber, // Send to TEST number
          message: messageToSend,
          leadName: testLead.lead,
          empresa: testLead.empresa,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook retornou ${response.status}`);
      }

      const result = await response.json();
      const isSuccess = result.success === true;

      if (isSuccess) {
        // Don't update lead status for test send
        setStatuses([{
          leadId: testLead.id,
          leadName: testLead.lead,
          message: messageToSend,
          status: "sent"
        }]);

        toast.success("Mensagem de teste enviada com sucesso!", {
          description: `Enviado para ${testPhoneNumber}`,
        });
      } else {
        throw new Error(result.error || result.message || "Falha no envio");
      }
    } catch (error) {
      setStatuses([{
        leadId: testLead.id,
        leadName: testLead.lead,
        message: messageToSend,
        status: "failed",
        error: String(error)
      }]);

      toast.error("Falha no envio de teste", {
        description: String(error)
      });
    }

    setIsDispatching(false);
  };

  const handleDispatch = async () => {
    if (isDispatching || validLeads.length === 0) {
      toast.error("Nenhum lead válido para enviar", {
        description: "Verifique se os leads possuem WhatsApp e mensagem configurados"
      });
      return;
    }

    // Verificar se webhook está configurado
    if (!whatsappWebhook) {
      toast.error("Configure o webhook WhatsApp nas Configurações da sidebar");
      return;
    }

    setTestMode(false);
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

      // Use edited message if available and we are in single mode
      const messageToSend = (isEditing && editedMessage && validLeads.length === 1) ? editedMessage : lead.mensagemWhatsApp;

      try {
        // Enviar para webhook n8n com Evolution API
        const response = await fetch(whatsappWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            whatsapp: lead.whatsapp,
            message: messageToSend,
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
            // If we edited the message, maybe we should update it in DB too? 
            // Let's update it to reflect what was actually sent.
            ...(isEditing && validLeads.length === 1 ? { mensagemWhatsApp: messageToSend } : {})
          });
        }

        setStatuses(prev => prev.map(s =>
          s.leadId === lead.id
            ? {
              ...s,
              status: isSuccess ? "sent" : "failed",
              error: isSuccess ? undefined : result.error || result.message,
              message: messageToSend // Update displayed message
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

            {/* Lista de status ou Editor Único */}
            <div className="space-y-2 overflow-y-auto flex-1 pr-2">
              {isEditing && validLeads.length === 1 && !isDispatching && !isComplete ? (
                <div className="space-y-2 p-1">
                  <label className="text-sm font-medium">Editar Mensagem para {validLeads[0].lead}:</label>
                  <textarea
                    className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={editedMessage}
                    onChange={(e) => setEditedMessage(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Você pode personalizar a mensagem final antes de enviar.
                  </p>
                </div>
              ) : (
                statuses.map(status => (
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
                ))
              )}
            </div>
          </>
        )}

        {/* Botões de ação */}
        <div className="flex flex-col gap-2 pt-4 border-t">
          {isComplete ? (
            <Button onClick={onClose} className="w-full">
              Fechar
            </Button>
          ) : (
            <>
              {/* Botão de Teste (apenas se não estiver enviando) */}
              {!isDispatching && validLeads.length > 0 && !testMode && (
                <Button
                  variant="secondary"
                  onClick={() => setShowTestConfirm(true)}
                  className="w-full"
                >
                  📤 Enviar Teste (1 mensagem)
                </Button>
              )}

              {/* Botões principais */}
              <div className="flex gap-2">
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
                  {isDispatching && !testMode ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    `Enviar para ${validLeads.length} lead(s)`
                  )}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Modal de Confirmação de Teste */}
        {showTestConfirm && validLeads.length > 0 && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center p-6 rounded-lg z-50">
            <div className="bg-card border rounded-lg p-6 max-w-md w-full space-y-4 shadow-lg">
              <div>
                <h3 className="text-lg font-semibold mb-2">Confirmar Envio de Teste</h3>
                <p className="text-sm text-muted-foreground">
                  Configure o número de destino para o teste.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Número de WhatsApp para Teste</label>
                <input
                  type="text"
                  placeholder="Ex: 5511999999999"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={testPhoneNumber}
                  onChange={(e) => setTestPhoneNumber(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Digite o número completo com DDI e DDD (apenas números).
                </p>
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium">Lead Simulado:</span>
                  <span className="text-sm text-right">{validLeads[0].lead}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium">Empresa:</span>
                  <span className="text-sm text-right">{validLeads[0].empresa}</span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-900 mb-2">Preview da Mensagem:</p>
                <p className="text-xs text-blue-800 whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {(isEditing && editedMessage) ? editedMessage : validLeads[0].mensagemWhatsApp}
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowTestConfirm(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleTestSend}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  Enviar Teste
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
