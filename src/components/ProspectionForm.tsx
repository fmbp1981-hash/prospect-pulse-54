import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Search, Loader2, Target, MapPin, Hash, Webhook } from "lucide-react";
import { ProspectionFormData } from "@/types/prospection";

interface ProspectionFormProps {
  onSearch: (data: ProspectionFormData) => void;
}

export const ProspectionForm = ({ onSearch }: ProspectionFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<ProspectionFormData>({
    niche: "",
    location: "",
    quantity: 50,
    webhookUrl: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.niche || !formData.location || !formData.webhookUrl) {
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
          webhookUrl: formData.webhookUrl, // Keep webhook URL
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
        <CardTitle className="text-2xl flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" />
          Nova Prospecção
        </CardTitle>
        <CardDescription>
          Configure sua busca de leads no Google Places
        </CardDescription>
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

            <div className="space-y-2">
              <Label htmlFor="webhookUrl" className="flex items-center gap-2">
                <Webhook className="h-4 w-4 text-muted-foreground" />
                URL do Webhook n8n
              </Label>
              <Input
                id="webhookUrl"
                type="url"
                placeholder="https://seu-n8n.app.n8n.cloud/webhook/..."
                value={formData.webhookUrl}
                onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                required
                className="transition-all focus:shadow-card font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Cole aqui a URL do webhook do seu fluxo n8n
              </p>
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
