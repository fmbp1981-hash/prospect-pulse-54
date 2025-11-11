import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocationCascade, LocationData } from "@/components/LocationCascade";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Search, Loader2, Target, MapPin, Hash, Webhook, Settings, CheckCircle2, MessageCircle, RefreshCw, XCircle, AlertCircle } from "lucide-react";
import { ProspectionFormData } from "@/types/prospection";
import { n8nMcp } from "@/lib/n8nMcp";

interface ProspectionFormProps {
  onSearch: (data: ProspectionFormData) => void;
}

type ExecutionStatus = "idle" | "loading" | "success" | "error";

export const ProspectionForm = ({ onSearch }: ProspectionFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [tempProspectionWebhook, setTempProspectionWebhook] = useState("");
  const [tempMcpUrl, setTempMcpUrl] = useState("");
  
  // Status modal states
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [leadsCount, setLeadsCount] = useState(0);
  
  const [formData, setFormData] = useState<ProspectionFormData>({
    niche: "",
    location: {
      country: "",
      state: "",
      city: "",
      neighborhood: ""
    },
    quantity: 50,
    webhookUrl: n8nMcp.getProspectionWebhook(),
  });

  // Carregar URLs atuais ao abrir modal
  useEffect(() => {
    if (isConfigOpen) {
      setTempProspectionWebhook(n8nMcp.getProspectionWebhook());
      setTempMcpUrl(localStorage.getItem("leadfinder_mcp_base_url") || "https://n8n.intellixai.com.br/mcp/xpag_banco_dados_wa");
    }
  }, [isConfigOpen]);

  const handleSaveConfig = () => {
    if (!tempProspectionWebhook.trim()) {
      toast.error("Webhook de prospecção não pode estar vazio");
      return;
    }

    if (!tempMcpUrl.trim()) {
      toast.error("URL do MCP não pode estar vazia");
      return;
    }

    try {
      new URL(tempProspectionWebhook);
      new URL(tempMcpUrl);
      
      // Salvar configurações
      localStorage.setItem("leadfinder_prospection_webhook", tempProspectionWebhook);
      localStorage.setItem("leadfinder_mcp_base_url", tempMcpUrl);
      
      toast.success("Configurações salvas com sucesso!");
      setIsConfigOpen(false);
      
      // Recarregar página para aplicar novas configurações
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      toast.error("URLs inválidas. Verifique o formato.");
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.niche || !formData.location.city) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (formData.quantity < 1 || formData.quantity > 500) {
      toast.error("A quantidade deve estar entre 1 e 500");
      return;
    }

    setIsLoading(true);
    setIsStatusModalOpen(true);
    setExecutionStatus("loading");
    setStatusMessage("Iniciando prospecção no Google Places...");
    setLeadsCount(formData.quantity);

    try {
      const result = await n8nMcp.startProspection({
        niche: formData.niche,
        location: formData.location,
        quantity: formData.quantity,
      });

      if (result.success) {
        setExecutionStatus("success");
        setStatusMessage(`Prospecção concluída com sucesso! ${result.totalLeads || formData.quantity} leads foram encontrados.`);
        setLeadsCount(result.totalLeads || formData.quantity);
        
        onSearch(formData);
        
        // Reset form após 2 segundos
        setTimeout(() => {
          setFormData({
            niche: "",
            location: {
              country: "",
              state: "",
              city: "",
              neighborhood: ""
            },
            quantity: 50,
            webhookUrl: n8nMcp.getProspectionWebhook(),
          });
        }, 2000);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error("Erro ao iniciar prospecção:", error);
      setExecutionStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "Falha na conexão com o webhook n8n. Verifique a configuração.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="shadow-elevated border-primary/10 animate-fade-in">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Search className="h-6 w-6 text-primary" />
              Nova Prospecção
            </CardTitle>
            <CardDescription>
              Configure sua busca de leads no Google Places
            </CardDescription>
          </div>
          
          <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="relative"
                type="button"
              >
                <Settings className="h-4 w-4" />
                <CheckCircle2 className="h-3 w-3 text-green-500 absolute -top-1 -right-1" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Configurar Integrações n8n</DialogTitle>
                <DialogDescription>
                  Edite os endpoints para prospecção e MCP Server
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="webhook-prospection">🎯 Webhook de Prospecção</Label>
                  <Input
                    id="webhook-prospection"
                    type="url"
                    placeholder="https://n8n.intellixai.com.br/webhook/xpag_prospecção_Outbound"
                    value={tempProspectionWebhook}
                    onChange={(e) => setTempProspectionWebhook(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Endpoint que inicia a busca de leads no Google Places
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mcp-url">🔄 MCP Server Base URL</Label>
                  <Input
                    id="mcp-url"
                    type="url"
                    placeholder="https://n8n.intellixai.com.br/mcp/xpag_banco_dados_wa"
                    value={tempMcpUrl}
                    onChange={(e) => setTempMcpUrl(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Base URL para sincronização com Google Sheets e envio WhatsApp via Evolution API
                  </p>
                  <div className="mt-3 p-3 bg-primary/5 rounded-md border border-primary/20">
                    <p className="text-xs font-semibold mb-2">Tools disponíveis no MCP:</p>
                    <div className="space-y-1 text-xs">
                      <code className="block">• get_rows - Buscar leads do CRM</code>
                      <code className="block">• add_row - Adicionar novo lead</code>
                      <code className="block">• update_row - Atualizar lead</code>
                      <code className="block">• evo_send_message - Enviar WhatsApp</code>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-accent/10 border border-accent rounded-lg">
                  <p className="text-sm font-medium mb-2">💡 Importante</p>
                  <p className="text-xs text-muted-foreground">
                    Após salvar, a página será recarregada para aplicar as novas configurações.
                    Certifique-se de que as URLs estão corretas antes de salvar.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsConfigOpen(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSaveConfig}
                  className="flex-1"
                >
                  Salvar Configurações
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="niche" className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                Nicho de Negócios
              </Label>
              <Input
                id="niche"
                placeholder="Ex: Restaurantes, Academias, Clínicas..."
                value={formData.niche}
                onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                required
                className="transition-all focus:shadow-card"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Localização
              </Label>
              <LocationCascade
                value={formData.location}
                onChange={(location) => setFormData({ ...formData, location })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity" className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                Quantidade de Leads
              </Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                max="500"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                required
                className="transition-all focus:shadow-card"
              />
              <p className="text-xs text-muted-foreground">Máximo: 500 leads por busca</p>
            </div>

          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full gradient-primary hover:opacity-90 transition-all shadow-card hover:shadow-elevated"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Iniciando prospecção...
              </>
            ) : (
              <>
                <Search className="mr-2 h-5 w-5" />
                Iniciar Prospecção
              </>
            )}
          </Button>
        </form>
      </CardContent>

      {/* Status Execution Modal */}
      <AlertDialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {executionStatus === "loading" && (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  Prospecção em Andamento
                </>
              )}
              {executionStatus === "success" && (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Prospecção Concluída!
                </>
              )}
              {executionStatus === "error" && (
                <>
                  <XCircle className="h-5 w-5 text-destructive" />
                  Erro na Prospecção
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
                  <div className="flex-shrink-0">
                    {executionStatus === "loading" && (
                      <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                    )}
                    {executionStatus === "success" && (
                      <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                      </div>
                    )}
                    {executionStatus === "error" && (
                      <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                        <AlertCircle className="h-6 w-6 text-destructive" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{statusMessage}</p>
                    {executionStatus === "loading" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Buscando até {leadsCount} leads...
                      </p>
                    )}
                    {executionStatus === "success" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {leadsCount} leads encontrados
                      </p>
                    )}
                  </div>
                </div>

                {executionStatus !== "loading" && (
                  <Button
                    onClick={() => setIsStatusModalOpen(false)}
                    className="w-full"
                    variant={executionStatus === "error" ? "destructive" : "default"}
                  >
                    {executionStatus === "error" ? "Tentar Novamente" : "Fechar"}
                  </Button>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
