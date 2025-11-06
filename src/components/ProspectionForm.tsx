import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Search, Loader2, Target, MapPin, Hash, Webhook, Settings, CheckCircle2, MessageCircle } from "lucide-react";
import { ProspectionFormData } from "@/types/prospection";
import { n8nMcp } from "@/lib/n8nMcp";

interface ProspectionFormProps {
  onSearch: (data: ProspectionFormData) => void;
}

const WEBHOOK_STORAGE_KEY = "leadfinder_webhook_url";

export const ProspectionForm = ({ onSearch }: ProspectionFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [tempWebhookUrl, setTempWebhookUrl] = useState("");
  const [tempMcpUrl, setTempMcpUrl] = useState("");
  const [tempWhatsAppUrl, setTempWhatsAppUrl] = useState("");
  const [formData, setFormData] = useState<ProspectionFormData>({
    niche: "",
    location: "",
    quantity: 50,
    webhookUrl: "",
  });

  // Carregar webhooks do localStorage
  useEffect(() => {
    const savedWebhook = localStorage.getItem(WEBHOOK_STORAGE_KEY);
    if (savedWebhook) {
      setFormData(prev => ({ ...prev, webhookUrl: savedWebhook }));
      setTempWebhookUrl(savedWebhook);
    }
    
    const savedMcp = n8nMcp.getMcpWebhookUrl();
    if (savedMcp) setTempMcpUrl(savedMcp);
    
    const savedWhatsApp = n8nMcp.getWhatsAppWebhookUrl();
    if (savedWhatsApp) setTempWhatsAppUrl(savedWhatsApp);
  }, []);

  const handleSaveWebhook = () => {
    if (!tempWebhookUrl.trim()) {
      toast.error("URL do webhook de prospecção não pode estar vazia");
      return;
    }

    try {
      new URL(tempWebhookUrl);
      localStorage.setItem(WEBHOOK_STORAGE_KEY, tempWebhookUrl);
      setFormData(prev => ({ ...prev, webhookUrl: tempWebhookUrl }));
      toast.success("Webhook de prospecção configurado!");
    } catch {
      toast.error("URL inválida. Verifique o formato.");
      return;
    }
  };

  const handleSaveMcpWebhook = () => {
    if (!tempMcpUrl.trim()) {
      toast.error("URL do MCP não pode estar vazia");
      return;
    }

    try {
      new URL(tempMcpUrl);
      n8nMcp.setMcpWebhookUrl(tempMcpUrl);
      toast.success("MCP configurado com sucesso!");
    } catch {
      toast.error("URL inválida. Verifique o formato.");
      return;
    }
  };

  const handleSaveWhatsAppWebhook = () => {
    if (!tempWhatsAppUrl.trim()) {
      toast.error("URL do WhatsApp não pode estar vazia");
      return;
    }

    try {
      new URL(tempWhatsAppUrl);
      n8nMcp.setWhatsAppWebhookUrl(tempWhatsAppUrl);
      toast.success("Webhook WhatsApp configurado!");
    } catch {
      toast.error("URL inválida. Verifique o formato.");
      return;
    }
  };

  const handleSaveAll = () => {
    handleSaveWebhook();
    handleSaveMcpWebhook();
    handleSaveWhatsAppWebhook();
    setIsConfigOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.webhookUrl) {
      toast.error("Configure o webhook antes de iniciar a prospecção");
      setIsConfigOpen(true);
      return;
    }

    if (!formData.niche || !formData.location) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (formData.quantity < 1 || formData.quantity > 500) {
      toast.error("A quantidade deve estar entre 1 e 500");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(formData.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          niche: formData.niche,
          location: formData.location,
          quantity: formData.quantity,
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        toast.success("Prospecção iniciada com sucesso!", {
          description: "O fluxo n8n foi acionado e está buscando leads.",
        });
        onSearch(formData);
        
        // Reset form
        setFormData({
          niche: "",
          location: "",
          quantity: 50,
          webhookUrl: formData.webhookUrl,
        });
      } else {
        throw new Error("Falha ao acionar webhook");
      }
    } catch (error) {
      console.error("Erro ao iniciar prospecção:", error);
      toast.error("Erro ao iniciar prospecção", {
        description: "Verifique a URL do webhook e tente novamente.",
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
                {formData.webhookUrl && (
                  <CheckCircle2 className="h-3 w-3 text-green-500 absolute -top-1 -right-1" />
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Configurar Webhooks n8n</DialogTitle>
                <DialogDescription>
                  Configure os webhooks para prospecção e integração WhatsApp
                </DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="prospection" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="prospection">
                    <Search className="h-4 w-4 mr-2" />
                    Prospecção
                  </TabsTrigger>
                  <TabsTrigger value="mcp">
                    <Webhook className="h-4 w-4 mr-2" />
                    MCP Status
                  </TabsTrigger>
                  <TabsTrigger value="whatsapp">
                    <MessageCircle className="h-4 w-4 mr-2" />
                    WhatsApp
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="prospection" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="webhook-prospection">Webhook de Prospecção</Label>
                    <Input
                      id="webhook-prospection"
                      type="url"
                      placeholder="https://seu-n8n.app.n8n.cloud/webhook/prospection"
                      value={tempWebhookUrl}
                      onChange={(e) => setTempWebhookUrl(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Webhook que inicia o fluxo de busca de leads no Google Places
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="mcp" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="webhook-mcp">MCP - Consulta de Status</Label>
                    <Input
                      id="webhook-mcp"
                      type="url"
                      placeholder="https://seu-n8n.app.n8n.cloud/webhook/check-whatsapp-status"
                      value={tempMcpUrl}
                      onChange={(e) => setTempMcpUrl(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Endpoint GET que retorna o status de envio WhatsApp para cada prospecção
                    </p>
                    <div className="mt-3 p-3 bg-muted rounded-md">
                      <p className="text-xs font-semibold mb-1">Formato esperado:</p>
                      <code className="text-xs">
                        GET /check-whatsapp-status?ids=id1,id2
                      </code>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="whatsapp" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="webhook-whatsapp">Webhook de Envio WhatsApp</Label>
                    <Input
                      id="webhook-whatsapp"
                      type="url"
                      placeholder="https://seu-n8n.app.n8n.cloud/webhook/send-whatsapp"
                      value={tempWhatsAppUrl}
                      onChange={(e) => setTempWhatsAppUrl(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Webhook que recebe as prospecções selecionadas e dispara mensagens WhatsApp
                    </p>
                    <div className="mt-3 p-3 bg-muted rounded-md">
                      <p className="text-xs font-semibold mb-1">Payload enviado:</p>
                      <code className="text-xs block overflow-x-auto">
                        {`{ prospections: [{ id, niche, location, ... }] }`}
                      </code>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSaveAll} className="flex-1">
                  Salvar Todas Configurações
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
              <Label htmlFor="location" className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Localização
              </Label>
              <Input
                id="location"
                placeholder="Ex: São Paulo, Zona Sul, Pinheiros..."
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                required
                className="transition-all focus:shadow-card"
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

            {formData.webhookUrl && (
              <div className="p-3 bg-muted rounded-lg border border-border">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">Webhook configurado</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsConfigOpen(true)}
                    type="button"
                    className="ml-auto"
                  >
                    Alterar
                  </Button>
                </div>
              </div>
            )}
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
