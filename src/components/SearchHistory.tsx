import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { History, Target, MapPin, Hash, Clock, MessageCircle, CheckCircle2, Loader2, Trash2, RefreshCw, Database, ExternalLink } from "lucide-react";
import { ProspectionSearch } from "@/types/prospection";
import { LocationData } from "@/components/LocationCascade";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface SearchHistoryProps {
  searches: ProspectionSearch[];
  onClearHistory: () => void;
  onReprocess?: (search: ProspectionSearch) => Promise<void>;
}

// Helper para formatar LocationData
const formatLocation = (location: string | LocationData): string => {
  if (typeof location === 'string') {
    return location;
  }
  
  const parts = [];
  if (location.neighborhood) parts.push(location.neighborhood);
  if (location.city) parts.push(location.city);
  if (location.state) parts.push(location.state);
  if (location.country) parts.push(location.country);
  
  return parts.join(', ') || 'Não especificada';
};

export const SearchHistory = ({ searches, onClearHistory, onReprocess }: SearchHistoryProps) => {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [whatsappStatuses, setWhatsappStatuses] = useState<Record<string, { status: 'sent' | 'not_sent' | 'failed'; sentAt?: string }>>({});
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set());
  const [leadCounts, setLeadCounts] = useState<Record<string, { count: number; loading: boolean; error: boolean }>>({});

  // Carregar contagem de leads do Supabase
  useEffect(() => {
    const loadLeadCounts = async () => {
      const counts: Record<string, { count: number; loading: boolean; error: boolean }> = {};

      for (const search of searches) {
        counts[search.id] = { count: 0, loading: true, error: false };
      }
      setLeadCounts(counts);

      // Buscar contagem para cada busca
      for (const search of searches) {
        try {
          const location = formatLocation(search.location);
          const searchTimestamp = new Date(search.timestamp);

          // Buscar leads que correspondem aos critérios da busca
          // Considerando leads criados próximos ao timestamp da busca (dentro de 1 hora)
          const startTime = new Date(searchTimestamp.getTime() - 60 * 60 * 1000);
          const endTime = new Date(searchTimestamp.getTime() + 60 * 60 * 1000);

          const { count, error } = await supabase
            .from('leads_prospeccao')
            .select('*', { count: 'exact', head: true })
            .eq('categoria', search.niche)
            .ilike('cidade', `%${location.split(',')[0].trim()}%`)
            .gte('created_at', startTime.toISOString())
            .lte('created_at', endTime.toISOString());

          if (error) throw error;

          setLeadCounts(prev => ({
            ...prev,
            [search.id]: { count: count || 0, loading: false, error: false }
          }));
        } catch (error) {
          console.error(`Error loading count for search ${search.id}:`, error);
          setLeadCounts(prev => ({
            ...prev,
            [search.id]: { count: 0, loading: false, error: true }
          }));
        }
      }
    };

    if (searches.length > 0) {
      loadLeadCounts();
    }

    // Status de WhatsApp (mantido como não enviado para histórico)
    const statuses: Record<string, { status: 'sent' | 'not_sent' | 'failed'; sentAt?: string }> = {};
    searches.forEach(search => {
      statuses[search.id] = { status: 'not_sent' };
    });
    setWhatsappStatuses(statuses);
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
    toast.error("Funcionalidade descontinuada", {
      description: "Use o envio de WhatsApp na tabela de leads",
    });
    
    // NOTA: Fluxo antigo de envio por prospecção foi substituído
    // Agora o envio é feito na LeadsTable usando leads individuais
    // com mensagens personalizadas do CRM
  };

  const handleReprocess = async (search: ProspectionSearch) => {
    if (!onReprocess) return;
    
    setReprocessingIds(prev => new Set(prev).add(search.id));
    
    try {
      await onReprocess(search);
      toast.success("Prospecção reprocessada com sucesso!");
    } catch (error) {
      toast.error("Erro ao reprocessar prospecção", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setReprocessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(search.id);
        return newSet;
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
  const hasWhatsAppConfig = true; // MCP integrado com webhook fixo

  return (
    <Card className="shadow-card animate-fade-in">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
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
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar Histórico de Prospecções</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja apagar todo o histórico local de prospecções? Esta ação não pode ser desfeita.
                  <br /><br />
                  <strong>Nota:</strong> Isso apenas remove o histórico da interface. Os leads no CRM não serão afetados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    onClearHistory();
                    toast.success("Histórico apagado com sucesso");
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Apagar Histórico
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
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
                  <span className="text-muted-foreground">{formatLocation(search.location)}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Hash className="h-4 w-4 text-primary" />
                  <span className="font-medium">Quantidade:</span>
                  <span className="text-muted-foreground">{search.quantity} leads</span>
                </div>

                {/* Status de salvamento no Supabase */}
                <div className="flex items-center gap-2 text-sm">
                  <Database className="h-4 w-4 text-primary" />
                  <span className="font-medium">Salvos no CRM:</span>
                  {leadCounts[search.id]?.loading ? (
                    <Badge variant="secondary" className="gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Carregando...
                    </Badge>
                  ) : leadCounts[search.id]?.error ? (
                    <Badge variant="destructive" className="gap-1">
                      Erro ao carregar
                    </Badge>
                  ) : (
                    <Badge
                      variant={leadCounts[search.id]?.count > 0 ? "default" : "secondary"}
                      className={leadCounts[search.id]?.count > 0 ? "bg-success hover:bg-success/90" : ""}
                    >
                      {leadCounts[search.id]?.count || 0} lead(s)
                    </Badge>
                  )}
                </div>
              </div>

              {/* Botões de ação */}
              <div className="mt-4 pt-4 border-t flex gap-2">
                {leadCounts[search.id]?.count > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      // Redirecionar para tabela com filtros aplicados
                      const location = formatLocation(search.location);
                      navigate(`/leads?categoria=${encodeURIComponent(search.niche)}&cidade=${encodeURIComponent(location.split(',')[0].trim())}`);
                      toast.success("Redirecionando para tabela de leads...");
                    }}
                    className="flex-1"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Ver Leads ({leadCounts[search.id]?.count})
                  </Button>
                )}

                {onReprocess && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReprocess(search)}
                    disabled={reprocessingIds.has(search.id)}
                    className="flex-1"
                  >
                    {reprocessingIds.has(search.id) ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Reprocessando...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Reprocessar
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
