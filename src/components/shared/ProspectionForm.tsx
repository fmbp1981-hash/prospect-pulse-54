import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocationCascade, LocationData } from "@/components/shared/LocationCascade";
import { toast } from "sonner";
import { Search, Loader2, Target, MapPin, Hash, RotateCcw, X, Package } from "lucide-react";
import { ProspectionFormData, ProspectionSearch } from "@/types/prospection";
import { QuickSelectNiches } from "@/components/shared/QuickSelectNiches";
import { QuickSelectLocations } from "@/components/shared/QuickSelectLocations";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { QUICK_PRODUCTS } from "@/data/prospectionQuickSelects";

interface ProspectionFormProps {
  onSearch: (data: ProspectionFormData) => void;
  lastSearch?: ProspectionSearch;
}

export const ProspectionForm = ({ onSearch, lastSearch }: ProspectionFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const [searchMode, setSearchMode] = useState<'niche' | 'product'>('niche');

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
  const [bairros, setBairros] = useState<string[]>([]);
  const [bairroInput, setBairroInput] = useState("");

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

    // Verificar se tem nome do estabelecimento OU localização
    const hasBusinessName = formData.businessName && formData.businessName.trim().length > 0;
    const hasCity = formData.location.city && formData.location.city.trim().length > 0;

    // Nicho só é obrigatório se NÃO tiver nome do estabelecimento
    if (!hasBusinessName && (!formData.niche || formData.niche.trim() === "")) {
      toast.error("Campo obrigatório vazio", {
        description: "Por favor, informe o nicho de negócios ou o nome do estabelecimento."
      });
      return;
    }

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
          bairros, // array de bairros
          user_id: user?.id, // Passar ID do usuário autenticado
          searchMode, // Modo de busca: nicho ou produto
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

  const handleAddBairro = () => {
    const value = bairroInput.trim();
    if (value && !bairros.includes(value)) {
      setBairros([...bairros, value]);
      setBairroInput("");
    }
  };

  const handleRemoveBairro = (bairro: string) => {
    setBairros(bairros.filter(b => b !== bairro));
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

            {/* Toggle Modo de Busca */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setSearchMode('niche')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  searchMode === 'niche'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                <Target className="h-4 w-4" />
                Nicho / Categoria
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('product')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  searchMode === 'product'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                <Package className="h-4 w-4" />
                Produto / Serviço
              </button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="niche" className="flex items-center gap-2">
                {searchMode === 'niche' ? (
                  <Target className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Package className="h-4 w-4 text-muted-foreground" />
                )}
                {searchMode === 'niche' ? 'Nicho de Negócios' : 'Produto ou Serviço'}
              </Label>

              {searchMode === 'niche' ? (
                <QuickSelectNiches
                  selectedNiche={formData.niche}
                  onSelect={(niche) => setFormData({ ...formData, niche })}
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PRODUCTS.flatMap(cat => cat.products.slice(0, 3)).map(product => (
                    <button
                      key={product}
                      type="button"
                      onClick={() => setFormData({ ...formData, niche: product })}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        formData.niche === product
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {product}
                    </button>
                  ))}
                </div>
              )}

              <Input
                id="niche"
                placeholder={searchMode === 'niche' ? 'Ex: Restaurantes, Clínicas, Academias...' : 'Ex: Vinhos, Chocolates finos, Móveis planejados...'}
                value={formData.niche}
                onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                className="transition-all focus:shadow-card"
              />
              {searchMode === 'product' && (
                <p className="text-xs text-muted-foreground">
                  💡 Digite o produto que o negócio vende. Ex: &quot;Vinhos&quot; encontra adegas, distribuidoras e lojas de vinho.
                </p>
              )}
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
            <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Label htmlFor="businessName" className="flex items-center gap-2 text-sm">
                <Search className="h-4 w-4 text-primary" />
                Busca por Nome do Estabelecimento
                <Badge variant="secondary" className="text-[10px]">Recomendado</Badge>
              </Label>
              <Input
                id="businessName"
                placeholder="Ex: Restaurante do João, Padaria Central..."
                value={formData.businessName || ""}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="transition-all focus:shadow-card border-primary/30"
              />
              <p className="text-xs text-muted-foreground">
                💡 <strong>Busca direta:</strong> Digite o nome exato do estabelecimento. 
                O nicho e localização são opcionais - serão extraídos automaticamente do Google.
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

            <div className="space-y-2">
              <Label htmlFor="bairros" className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Bairros/Regiões (opcional)
              </Label>
              <div className="flex gap-2 flex-wrap">
                {bairros.map(bairro => (
                  <span key={bairro} className="inline-flex items-center bg-primary/10 rounded px-2 py-1 text-xs mr-1 mb-1">
                    {bairro}
                    <button type="button" className="ml-1 text-primary" onClick={() => handleRemoveBairro(bairro)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  id="bairros"
                  type="text"
                  value={bairroInput}
                  onChange={e => setBairroInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddBairro(); } }}
                  placeholder="Digite e pressione Enter"
                  className="border rounded px-2 py-1 text-xs min-w-[120px]"
                />
                <Button type="button" size="sm" variant="outline" onClick={handleAddBairro} disabled={!bairroInput.trim()}>
                  Adicionar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Adicione um ou mais bairros para filtrar a busca.</p>
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
