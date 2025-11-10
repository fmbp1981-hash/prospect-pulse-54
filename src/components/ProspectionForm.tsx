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
import { Search, Loader2, Target, MapPin, Hash, Webhook, Settings, CheckCircle2, MessageCircle, RefreshCw } from "lucide-react";
import { ProspectionFormData } from "@/types/prospection";
import { n8nMcp } from "@/lib/n8nMcp";

interface ProspectionFormProps {
  onSearch: (data: ProspectionFormData) => void;
}

export const ProspectionForm = ({ onSearch }: ProspectionFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [formData, setFormData] = useState<ProspectionFormData>({
    niche: "",
    location: {
      country: "",
      state: "",
      city: "",
      neighborhood: ""
    },
    quantity: 50,
    webhookUrl: n8nMcp.getProspectionWebhook(), // Webhook fixo
  });


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

    try {
      const result = await n8nMcp.startProspection({
        niche: formData.niche,
        location: formData.location,
        quantity: formData.quantity,
      });

      if (result.success) {
        toast.success("Prospecção iniciada com sucesso!", {
          description: `${result.totalLeads || formData.quantity} leads serão buscados no Google Places.`,
        });
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
          webhookUrl: n8nMcp.getProspectionWebhook(),
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error("Erro ao iniciar prospecção:", error);
      toast.error("Erro ao iniciar prospecção", {
        description: error instanceof Error ? error.message : "Verifique a configuração do n8n.",
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
                  Endpoints para prospecção e MCP Server (Google Sheets + WhatsApp)
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>🎯 Webhook de Prospecção</Label>
                  <div className="p-3 bg-muted rounded-lg font-mono text-xs break-all">
                    {n8nMcp.getProspectionWebhook()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Inicia a busca de leads no Google Places
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>🔄 MCP Server Base URL</Label>
                  <div className="p-3 bg-muted rounded-lg font-mono text-xs break-all">
                    https://n8n.intellixai.com.br/mcp/xpag_banco_dados_wa
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sincronização com Google Sheets, envio WhatsApp via Evolution API
                  </p>
                  <div className="mt-3 p-3 bg-primary/5 rounded-md border border-primary/20">
                    <p className="text-xs font-semibold mb-2">Tools disponíveis:</p>
                    <div className="space-y-1 text-xs">
                      <code className="block">• get_rows - Buscar leads do CRM</code>
                      <code className="block">• add_row - Adicionar novo lead</code>
                      <code className="block">• update_row - Atualizar lead</code>
                      <code className="block">• evo_send_message - Enviar WhatsApp</code>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-accent/10 border border-accent rounded-lg">
                  <p className="text-sm font-medium mb-2">✅ Integração Ativa</p>
                  <p className="text-xs text-muted-foreground">
                    Os endpoints estão configurados e prontos para uso. Para alterá-los, 
                    edite os valores no código-fonte (src/lib/n8nMcp.ts e src/lib/mcpAdapter.ts).
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={() => setIsConfigOpen(false)} className="w-full">
                  Fechar
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
    </Card>
  );
};
