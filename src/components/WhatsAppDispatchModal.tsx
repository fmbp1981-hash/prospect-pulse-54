import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Lead } from "@/types/prospection";
import { n8nMcp } from "@/lib/n8nMcp";
import { auditWhatsAppDispatch } from "@/lib/audit";

interface DispatchStatus {
  leadId: string;
  leadName: string;
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

  useEffect(() => {
    if (isOpen && selectedLeads.length > 0) {
      setStatuses(
        selectedLeads.map(lead => ({
          leadId: lead.id,
          leadName: lead.lead,
          status: "pending" as const
        }))
      );
    }
  }, [isOpen, selectedLeads]);

  const handleDispatch = async () => {
    if (isDispatching) return;
    
    setIsDispatching(true);

    // Processar leads sequencialmente
    for (let i = 0; i < selectedLeads.length; i++) {
      const lead = selectedLeads[i];
      
      // Atualizar status para "sending"
      setStatuses(prev => prev.map(s => 
        s.leadId === lead.id ? { ...s, status: "sending" } : s
      ));

      try {
        // Chamar webhook de envio
        const result = await n8nMcp.sendWhatsAppAndUpdateSheets([lead.id]);
        
        // Atualizar status baseado no resultado
        setStatuses(prev => prev.map(s => 
          s.leadId === lead.id 
            ? { ...s, status: result.success ? "sent" : "failed", error: result.message } 
            : s
        ));
        
        // Delay entre envios para evitar rate limit
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
    await auditWhatsAppDispatch(selectedLeads.map(l => l.id), sentCount, failedCount);

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

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span className="text-success font-medium">{sentCount} enviados</span>
            <span className="text-destructive font-medium">{failedCount} falhas</span>
            <span>{selectedLeads.length} total</span>
          </div>
        </div>

        {/* Lista de status */}
        <div className="space-y-2 overflow-y-auto flex-1 pr-2">
          {statuses.map(status => (
            <div 
              key={status.leadId}
              className="flex items-center justify-between p-3 bg-muted rounded-lg"
            >
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
          ))}
        </div>

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
                disabled={isDispatching}
                className="flex-1"
              >
                {isDispatching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Iniciar Envio"
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
