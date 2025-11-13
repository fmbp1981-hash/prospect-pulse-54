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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Search, Loader2, Target, MapPin, Hash, Settings, CheckCircle2 } from "lucide-react";
import { ProspectionFormData } from "@/types/prospection";
import { QuickSelectNiches } from "@/components/QuickSelectNiches";
import { QuickSelectLocations } from "@/components/QuickSelectLocations";

interface ProspectionFormProps {
  onSearch: (data: ProspectionFormData) => void;
}

export const ProspectionForm = ({ onSearch }: ProspectionFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [tempProspectionWebhook, setTempProspectionWebhook] = useState("");
  const [tempMcpUrl, setTempMcpUrl] = useState("");
  
  const [formData, setFormData] = useState<ProspectionFormData>({
    niche: "",
    location: {
      country: "",
      state: "",
      city: "",
      neighborhood: ""
    },
    quantity: 50,
    webhookUrl: "",
  });

  // Carregar URLs atuais ao abrir modal
  useEffect(() => {
    if (isConfigOpen) {
      setTempProspectionWebhook(localStorage.getItem("leadfinder_prospection_webhook") || "");
      setTempMcpUrl(localStorage.getItem("leadfinder_mcp_base_url") || "");
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

  const testWebhookConnection = async () => {
    try {
      const testToast = toast.loading("Testando conexão com webhook...");
      
      const response = await fetch(tempProspectionWebhook, {
        method: "OPTIONS",
        headers: { "Content-Type": "application/json" },
      });
      
      if (response.ok) {
        toast.success("✅ Webhook acessível e configurado!", { id: testToast });
      } else {
        toast.error(`⚠️ Webhook retornou status ${response.status}`, { 
          id: testToast,
          description: "Verifique se o workflow está ativo no n8n"
        });
      }
    } catch (error) {
      toast.error("❌ Falha na conexão", {
        description: "Verifique CORS, URL e se o n8n está acessível"
      });
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
    
    // Toast de loading
    const loadingToast = toast.loading("Iniciando prospecção no Google Places...", {
      description: `Buscando até ${formData.quantity} leads...`,
      duration: Infinity,
    });

    try {
      // TODO: Implementar prospecção via Supabase Edge Function
      toast.info("Prospecção sendo processada", {
        id: loadingToast,
        description: "Esta funcionalidade será implementada em breve",
        duration: 3000,
      });

      // Simular sucesso por enquanto
      onSearch(formData);
      
      // Reset form
      setFormData({
        niche: "",
        location: {
          country: "",
          state: "",
          city: "",
          neighborhood: ""
        },
        quantity: 50,
        webhookUrl: "",
      });
    } catch (error) {
      console.error("Erro ao iniciar prospecção:", error);
      
      let errorMsg = "Falha na conexão com o webhook n8n";
      let errorDesc = "Verifique a configuração.";
      
      if (error instanceof Error) {
        errorMsg = error.message;
        
        if (error.message.includes("No Respond to Webhook")) {
          errorDesc = "Configure um nó 'Respond to Webhook' no workflow n8n";
        } else if (error.message.includes("Failed to fetch")) {
          errorDesc = "Possíveis causas:\n• Workflow não está ativo no n8n\n• CORS não configurado\n• URL incorreta";
        }
      }
      
      toast.error(errorMsg, {
        id: loadingToast,
        description: errorDesc,
        duration: 6000,
      });
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
                  onClick={testWebhookConnection}
                  className="flex-1"
                  type="button"
                >
                  🔍 Testar Conexão
                </Button>
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
              
              <QuickSelectNiches
                selectedNiche={formData.niche}
                onSelect={(niche) => setFormData({ ...formData, niche })}
              />
              
              <Input
                id="niche"
                placeholder="Ou digite manualmente..."
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
              
              <QuickSelectLocations
                selectedLocation={formData.location}
                onSelect={(location) => setFormData({ ...formData, location })}
              />
              
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
    </Card>
  );
};
