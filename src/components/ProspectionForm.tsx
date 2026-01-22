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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ProspectionFormProps {
  onSearch: (data: ProspectionFormData) => void;
  lastSearch?: ProspectionSearch;
}

export const ProspectionForm = ({ onSearch, lastSearch }: ProspectionFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const [formData, setFormData] = useState<ProspectionFormData>({
    niche: "",
    location: {
      country: "",
      state: "",
      city: "",
      neighborhood: ""
    },
    quantity: 50,
    businessName: "", // Nome do estabelecimento (opcional)
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
    });

    toast.success("Dados da última pesquisa carregados!", {
      description: "Você pode editar os campos antes de iniciar a prospecção."
    });
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Função de normalização para remover acentos e espaços extras
    const normalizeText = (text: string): string => {
      return text
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    };

    // Validação de campos obrigatórios com mensagens específicas
    if (!formData.niche || formData.niche.trim() === "") {
      toast.error("Campo obrigatório vazio", {
        description: "Por favor, informe o nicho de negócios que deseja prospectar."
      });
      return;
    }

    // Verificar se tem nome do estabelecimento OU localização
    const hasBusinessName = formData.businessName && formData.businessName.trim().length > 0;
    const hasCity = formData.location.city && formData.location.city.trim().length > 0;

    if (!hasBusinessName && !hasCity) {
      toast.error("Localização ou nome do estabelecimento obrigatório", {
        description: "Informe a cidade para busca genérica ou o nome do estabelecimento para busca específica."
      });
      return;
    }

    // Se tem cidade, validar tamanho
    if (hasCity) {
      const normalizedCity = normalizeText(formData.location.city);
      if (normalizedCity.length < 3) {
        toast.error("Nome de cidade muito curto", {
          description: "Por favor, informe o nome completo da cidade."
        });
        return;
      }
    }

    if (formData.quantity < 1 || formData.quantity > 500) {
      toast.error("A quantidade deve estar entre 1 e 500");
      return;
    }

    setIsLoading(true);

    const loadingToast = toast.loading("Iniciando prospecção no Google Places...", {
      description: hasBusinessName 
        ? `Buscando "${formData.businessName}"...` 
        : `Buscando até ${formData.quantity} leads...`,
      duration: Infinity,
    });

    try {
      console.log("📡 Chamando edge function de prospecção...", formData);

      // Incluir user_id para multi-tenant
      const { data, error } = await supabase.functions.invoke('prospection', {
        body: {
          ...formData,
          user_id: user?.id, // Passar ID do usuário autenticado
        }
      });

      if (error) {
        console.error("❌ Erro retornado pela edge function:", error);
        throw error;
      }

      console.log("✅ Resposta completa da prospecção:", data);

      // Verificar se houve sucesso
      if (!data?.success) {
        throw new Error(data?.error || 'Erro desconhecido na prospecção');
      }

      // Exibir resultados detalhados
      const { insertedCount, recurrentCount, total, failedProcessing, failedInsertion } = data;

      let message = `Prospecção concluída! ${total} leads processados.`;

      const details = [];
      if (insertedCount > 0) details.push(`${insertedCount} novos`);
      if (recurrentCount > 0) details.push(`${recurrentCount} recorrentes`);

      if (details.length > 0) {
        message += ` (${details.join(", ")})`;
      }

      // Se houver falhas, mostrar warning ao invés de success
      if (failedProcessing > 0 || failedInsertion > 0) {
        message += `. Avisos: ${failedProcessing || 0} falhas no processamento, ${failedInsertion || 0} falhas na inserção`;
        console.warn("⚠️ Prospecção com avisos:", data.details);
        toast.warning(message, {
          id: loadingToast,
          description: "Alguns leads podem não ter sido processados. Verifique os logs.",
          duration: 6000
        });
      } else {
        toast.success(message, {
          id: loadingToast,
          description: "Todos os leads foram processados com sucesso!",
          duration: 5000
        });
      }

      console.log("📊 Detalhes da prospecção:", {
        insertedCount,
        recurrentCount,
        total,
        failedProcessing,
        failedInsertion,
        details: data.details
      });

      onSearch({
        ...formData,
        savedCount: insertedCount
      } as any); // Cast as any because ProspectionFormData doesn't have savedCount, but we pass it to handleNewSearch which uses it for ProspectionSearch

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
        businessName: "",
      });
    } catch (error) {
      console.error("❌ Erro na prospecção:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";

      toast.error("Erro ao realizar prospecção", {
        id: loadingToast,
        description: errorMessage,
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

            {/* Campo opcional: Nome do Estabelecimento */}
            <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-dashed border-muted-foreground/30">
              <Label htmlFor="businessName" className="flex items-center gap-2 text-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                Nome do Estabelecimento
                <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="businessName"
                placeholder="Ex: Restaurante do João, Padaria Central..."
                value={formData.businessName || ""}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="transition-all focus:shadow-card"
              />
              <p className="text-xs text-muted-foreground">
                💡 Para buscar um estabelecimento específico pelo nome, preencha este campo. 
                A localização é opcional neste caso.
              </p>
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
