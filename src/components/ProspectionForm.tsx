import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocationCascade, LocationData } from "@/components/LocationCascade";
import { toast } from "sonner";
import { Search, Loader2, Target, MapPin, Hash } from "lucide-react";
import { ProspectionFormData } from "@/types/prospection";
import { QuickSelectNiches } from "@/components/QuickSelectNiches";
import { QuickSelectLocations } from "@/components/QuickSelectLocations";

interface ProspectionFormProps {
  onSearch: (data: ProspectionFormData) => void;
}

export const ProspectionForm = ({ onSearch }: ProspectionFormProps) => {
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
      // Implementar Edge Function de prospecção com Google Places API
      toast.info("Prospecção será processada via Supabase", {
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
