import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocationCascade, LocationData } from "@/components/LocationCascade";
import { toast } from "sonner";
import { Search, Loader2, Target, MapPin, Hash, RotateCcw } from "lucide-react";
import { ProspectionFormData, ProspectionSearch } from "@/types/prospection";
import { QuickSelectNiches } from "@/components/QuickSelectNiches";
import { QuickSelectLocations } from "@/components/QuickSelectLocations";
import { Badge } from "@/components/ui/badge";

interface ProspectionFormProps {
  onSearch: (data: ProspectionFormData) => void;
  lastSearch?: ProspectionSearch;
}

export const ProspectionForm = ({ onSearch, lastSearch }: ProspectionFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  
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

  const handleUseLastSearch = () => {
    if (!lastSearch) return;
    
    // Garantir que location seja do tipo LocationData
    const locationData: LocationData = typeof lastSearch.location === 'string'
      ? { country: "", state: "", city: lastSearch.location, neighborhood: "" }
      : lastSearch.location;
    
    setFormData({
      niche: lastSearch.niche,
      location: locationData,
      quantity: lastSearch.quantity,
      webhookUrl: lastSearch.webhookUrl || "",
    });
    
    toast.success("Dados da última pesquisa carregados!", {
      description: "Você pode editar os campos antes de iniciar a prospecção."
    });
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

    // Verificar se webhook está configurado
    const prospectionWebhook = localStorage.getItem("prospection_webhook_url");
    if (!prospectionWebhook) {
      toast.error("Configure o webhook de prospecção nas Configurações da sidebar");
      return;
    }

    setIsLoading(true);
    
    const loadingToast = toast.loading("Iniciando prospecção no Google Places...", {
      description: `Buscando até ${formData.quantity} leads...`,
      duration: Infinity,
    });

    try {
      // Enviar para webhook n8n
      const response = await fetch(prospectionWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: formData.niche,
          location: formData.location,
          quantity: formData.quantity,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro no webhook: ${response.status}`);
      }

      toast.success("Prospecção iniciada com sucesso!", {
        id: loadingToast,
        description: "O n8n está processando sua busca. Os leads aparecerão na tabela em breve.",
        duration: 5000,
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
        webhookUrl: "",
      });
    } catch (error) {
      console.error("Erro ao iniciar prospecção:", error);
      
      toast.error("Erro ao iniciar prospecção", {
        id: loadingToast,
        description: error instanceof Error ? error.message : "Erro desconhecido",
        duration: 6000,
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
        {lastSearch && (
          <div className="mb-6 p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Última pesquisa
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(lastSearch.timestamp).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUseLastSearch}
                className="h-8"
              >
                <RotateCcw className="h-3 w-3 mr-1.5" />
                Usar novamente
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Nicho:</span>
                <p className="font-medium mt-0.5">{lastSearch.niche}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Local:</span>
                <p className="font-medium mt-0.5">
                  {typeof lastSearch.location === 'string' 
                    ? lastSearch.location 
                    : lastSearch.location.city}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Quantidade:</span>
                <p className="font-medium mt-0.5">{lastSearch.quantity} leads</p>
              </div>
            </div>
          </div>
        )}
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
