import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { History, Target, MapPin, Hash, Clock, MessageCircle, CheckCircle2, Loader2 } from "lucide-react";
import { ProspectionSearch } from "@/types/prospection";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { n8nMcp } from "@/lib/n8nMcp";
import { toast } from "sonner";

interface SearchHistoryProps {
  searches: ProspectionSearch[];
}

export const SearchHistory = ({ searches }: SearchHistoryProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [whatsappStatuses, setWhatsappStatuses] = useState<Record<string, { status: 'sent' | 'not_sent' | 'failed'; sentAt?: string }>>({});
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Carregar status de WhatsApp ao montar o componente
  useEffect(() => {
    const loadWhatsAppStatuses = async () => {
      if (searches.length === 0) return;
      
      setIsLoadingStatuses(true);
      const ids = searches.map(s => s.id);
      const statuses = await n8nMcp.checkWhatsAppStatus(ids);
      setWhatsappStatuses(statuses);
      setIsLoadingStatuses(false);
    };

    loadWhatsAppStatuses();
  }, [searches]);

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    const notSentIds = searches
      .filter(s => whatsappStatuses[s.id]?.status !== 'sent')
      .map(s => s.id);
    
    if (selectedIds.size === notSentIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notSentIds));
    }
  };

  const handleSendWhatsApp = async () => {
    if (selectedIds.size === 0) {
      toast.error("Selecione ao menos uma prospecção");
      return;
    }

    const selectedProspections = searches.filter(s => selectedIds.has(s.id));
    
    setIsSending(true);
    const result = await n8nMcp.sendWhatsAppMessages(selectedProspections);
    setIsSending(false);

    if (result.success) {
      toast.success(`Mensagens enviadas!`, {
        description: `${selectedIds.size} prospecção(ões) enviada(s) para o n8n`,
      });
      
      // Atualizar status localmente
      const updatedStatuses = { ...whatsappStatuses };
      selectedIds.forEach(id => {
        updatedStatuses[id] = { status: 'sent', sentAt: new Date().toISOString() };
      });
      setWhatsappStatuses(updatedStatuses);
      setSelectedIds(new Set());
    } else {
      toast.error("Erro ao enviar mensagens", {
        description: result.message,
      });
    }
  };

  const getStatusColor = (status: ProspectionSearch['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-accent text-accent-foreground';
      case 'processing':
        return 'bg-primary text-primary-foreground';
      case 'error':
        return 'bg-destructive text-destructive-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const getStatusLabel = (status: ProspectionSearch['status']) => {
    switch (status) {
      case 'completed':
        return 'Concluída';
      case 'processing':
        return 'Processando';
      case 'error':
        return 'Erro';
      default:
        return 'Pendente';
    }
  };

  if (searches.length === 0) {
    return (
      <Card className="shadow-card animate-fade-in">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Histórico de Buscas
          </CardTitle>
          <CardDescription>
            Suas prospecções anteriores aparecerão aqui
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma prospecção realizada ainda</p>
            <p className="text-sm mt-2">Faça sua primeira busca acima</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const notSentCount = searches.filter(s => whatsappStatuses[s.id]?.status !== 'sent').length;
  const hasWhatsAppConfig = !!n8nMcp.getWhatsAppWebhookUrl();

  return (
    <Card className="shadow-card animate-fade-in">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          Histórico de Buscas
        </CardTitle>
        <CardDescription>
          {searches.length} {searches.length === 1 ? 'prospecção realizada' : 'prospecções realizadas'}
          {hasWhatsAppConfig && notSentCount > 0 && (
            <span className="ml-2 text-primary">• {notSentCount} não enviada(s)</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasWhatsAppConfig && notSentCount > 0 && (
          <div className="mb-4 p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all"
                  checked={selectedIds.size === notSentCount && notSentCount > 0}
                  onCheckedChange={handleSelectAll}
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  Selecionar todas não enviadas ({notSentCount})
                </label>
              </div>
              <Badge variant="outline" className="text-xs">
                {selectedIds.size} selecionada(s)
              </Badge>
            </div>
            
            {selectedIds.size > 0 && (
              <Button
                onClick={handleSendWhatsApp}
                disabled={isSending}
                className="w-full"
                size="lg"
              >
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando mensagens...
                  </>
                ) : (
                  <>
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Enviar Mensagens ({selectedIds.size})
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        <div className="space-y-4">
          {searches.map((search) => {
            const whatsappStatus = whatsappStatuses[search.id];
            const isSent = whatsappStatus?.status === 'sent';
            const isSelectable = hasWhatsAppConfig && !isSent;
            
            return (
            <div
              key={search.id}
              className="border rounded-lg p-4 hover:border-primary/50 transition-all hover:shadow-card"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {isSelectable && (
                    <Checkbox
                      id={`select-${search.id}`}
                      checked={selectedIds.has(search.id)}
                      onCheckedChange={() => handleToggleSelect(search.id)}
                    />
                  )}
                  <Badge className={getStatusColor(search.status)}>
                    {getStatusLabel(search.status)}
                  </Badge>
                  {isSent && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      WhatsApp Enviado
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {format(new Date(search.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="font-medium">Nicho:</span>
                  <span className="text-muted-foreground">{search.niche}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="font-medium">Localização:</span>
                  <span className="text-muted-foreground">{search.location}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Hash className="h-4 w-4 text-primary" />
                  <span className="font-medium">Quantidade:</span>
                  <span className="text-muted-foreground">{search.quantity} leads</span>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
