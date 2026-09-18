import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocationCascade, LocationData } from "@/components/LocationCascade";
import { toast } from "sonner";
import {
  Search, Loader2, Target, MapPin, Hash, RotateCcw, X, Package,
  Linkedin, Building2, UserRound, Briefcase, ExternalLink, Sparkles, UserPlus, Check, Copy,
  type LucideIcon,
} from "lucide-react";
import {
  ProspectionFormData, ProspectionSearch, ProspectionChannel, LinkedinSearchBy,
} from "@/types/prospection";
import { QuickSelectNiches } from "@/components/QuickSelectNiches";
import { LinkedinIndustrySelect } from "@/components/LinkedinIndustrySelect";
import { QuickSelectLocations } from "@/components/QuickSelectLocations";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { QUICK_PRODUCTS } from "@/data/prospectionQuickSelects";
import { useLinkedinProspection, LINKEDIN_SEARCH_BY_LABELS } from "@/hooks/useLinkedinProspection";

interface ProspectionFormProps {
  onSearch: (data: ProspectionFormData & {
    savedCount?: number;
    channel?: ProspectionChannel;
    linkedinJobId?: string;
    linkedinSummary?: ProspectionSearch['linkedinSummary'];
  }) => void;
  lastSearch?: ProspectionSearch;
}

const LINKEDIN_SEARCH_BY_ICONS: Record<LinkedinSearchBy, typeof UserRound> = {
  pessoa: UserRound,
  empresa: Building2,
  cargo: Briefcase,
};

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

interface SegmentedToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  layoutId: string;
}

/** Pill de segmentação com indicador deslizante (framer-motion), usada para
 * todos os seletores de modo do formulário (canal, modo de busca, tipo de
 * busca LinkedIn) — substitui o toggle retangular anterior. */
function SegmentedToggle<T extends string>({ value, onChange, options, layoutId }: SegmentedToggleProps<T>) {
  return (
    <div className="flex gap-1 rounded-full border border-border bg-muted/50 p-1">
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`relative flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-primary shadow-card"
                transition={{ type: "spring", stiffness: 500, damping: 34 }}
              />
            )}
            <Icon className="relative z-10 h-4 w-4" />
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Ícone de seção envolto num círculo suave — dá peso visual aos rótulos
 * sem depender de cartões aninhados. */
function IconBadge({ icon: Icon, tone = "primary" }: { icon: LucideIcon; tone?: "primary" | "muted" }) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
        tone === "primary" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

/** Mensagem de abordagem sugerida pra colar manualmente no LinkedIn — o envio
 * em si é sempre uma ação humana (nunca automatizado, ver docs/PROSPECCAO-MULTICANAL.md
 * seção 3.2: automação de mensagem no LinkedIn é risco real de banimento). */
function buildLinkedinOutreachMessage(name: string, roleTitle: string | null, companyName: string | null): string {
  const firstName = name.split(' ')[0];
  const context = roleTitle && companyName
    ? `como ${roleTitle} na ${companyName}`
    : companyName
      ? `na ${companyName}`
      : '';
  return `Olá ${firstName}, tudo bem? Vi seu perfil${context ? ` ${context}` : ''} e gostaria de conversar sobre uma oportunidade que pode ser interessante pra você. Podemos trocar uma ideia?`;
}

export const ProspectionForm = ({ onSearch, lastSearch }: ProspectionFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const [channel, setChannel] = useState<ProspectionChannel>('gmn');
  const [searchMode, setSearchMode] = useState<'niche' | 'product'>('niche');

  // --- Prospecção LinkedIn: estado e chamadas de API centralizados no hook ---
  const linkedin = useLinkedinProspection({
    onSearchCompleted: (params, summary) => {
      onSearch({
        niche: params.searchQuery,
        location: params.location,
        quantity: params.maxItems,
        savedCount: summary.created,
        channel: 'linkedin',
        linkedinJobId: summary.jobId,
        linkedinSummary: {
          found: summary.found,
          created: summary.created,
          skippedDuplicate: summary.skippedDuplicate,
          skippedSuppressed: summary.skippedSuppressed,
        },
      });
    },
  });

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
  // Estado de texto separado do quantity numérico: permite digitar livremente
  // (inclusive apagar tudo antes de escrever um novo valor) sem o campo forçar
  // "0" a cada tecla — o clamp (1-500) só acontece no blur.
  const [quantityInput, setQuantityInput] = useState(String(formData.quantity));
  // Espelha linkedin.maxItems como texto (mesmo motivo do quantityInput acima).
  const [maxItemsInput, setMaxItemsInput] = useState("20");

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
    setQuantityInput(String(lastSearch.quantity));

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
      setQuantityInput("50");
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
    <Card className="animate-fade-in overflow-hidden rounded-3xl border-primary/10 shadow-elevated">
      <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-accent/70" />
      <CardHeader className="space-y-1 pb-4 pt-7">
        <CardTitle className="flex items-center gap-2.5 text-2xl">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            {channel === 'linkedin' ? <Linkedin className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </span>
          Nova Prospecção
        </CardTitle>
        <CardDescription>
          {channel === 'linkedin'
            ? 'Busque pessoas no LinkedIn (camada pública, sem login) e envie os melhores contatos para o CRM'
            : 'Configure sua busca de leads no Google Places'}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-8">
        {/* Toggle de Canal de Prospecção */}
        <div className="mb-6 space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Canal de Prospecção
          </Label>
          <SegmentedToggle<ProspectionChannel>
            value={channel}
            onChange={setChannel}
            layoutId="channel-pill"
            options={[
              { value: 'gmn', label: 'Google Maps', icon: Building2 },
              { value: 'linkedin', label: 'LinkedIn', icon: Linkedin },
            ]}
          />
        </div>

        {channel === 'gmn' && lastSearch && (!lastSearch.channel || lastSearch.channel === 'gmn') && (
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
        {channel === 'gmn' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">

            {/* Toggle Modo de Busca */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">Modo de Busca</Label>
              <SegmentedToggle<'niche' | 'product'>
                value={searchMode}
                onChange={setSearchMode}
                layoutId="search-mode-pill"
                options={[
                  { value: 'niche', label: 'Nicho / Categoria', icon: Target },
                  { value: 'product', label: 'Produto / Serviço', icon: Package },
                ]}
              />
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
                className="rounded-xl transition-all focus:shadow-card"
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
                className="rounded-xl transition-all focus:shadow-card border-primary/30"
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
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={quantityInput}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setQuantityInput(digits);
                  if (digits !== "") {
                    setFormData({ ...formData, quantity: parseInt(digits, 10) });
                  }
                }}
                onBlur={() => {
                  const parsed = parseInt(quantityInput, 10);
                  const clamped = Math.min(500, Math.max(1, Number.isFinite(parsed) ? parsed : 1));
                  setQuantityInput(String(clamped));
                  setFormData((prev) => ({ ...prev, quantity: clamped }));
                }}
                required
                className="rounded-xl transition-all focus:shadow-card"
              />
              <p className="text-xs text-muted-foreground">Digite a quantidade desejada — de 1 a 500 leads por busca</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bairros" className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Bairros/Regiões (opcional)
              </Label>
              {bairros.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {bairros.map(bairro => (
                    <Badge key={bairro} variant="secondary" className="gap-1 pr-1.5">
                      {bairro}
                      <button
                        type="button"
                        className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        onClick={() => handleRemoveBairro(bairro)}
                        aria-label={`Remover ${bairro}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  id="bairros"
                  value={bairroInput}
                  onChange={e => setBairroInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddBairro(); } }}
                  placeholder="Digite e pressione Enter"
                  className="rounded-xl transition-all focus:shadow-card"
                />
                <Button type="button" variant="outline" onClick={handleAddBairro} disabled={!bairroInput.trim()}>
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
        )}

        {channel === 'linkedin' && (
          <div className="space-y-6">
            <div className="space-y-4">
              {/* Toggle: buscar por nome, empresa ou cargo */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  Buscar por
                </Label>
                <SegmentedToggle<LinkedinSearchBy>
                  value={linkedin.searchBy}
                  onChange={linkedin.setSearchBy}
                  layoutId="linkedin-search-by-pill"
                  options={(Object.keys(LINKEDIN_SEARCH_BY_LABELS) as LinkedinSearchBy[]).map((mode) => ({
                    value: mode,
                    label: LINKEDIN_SEARCH_BY_LABELS[mode].label,
                    icon: LINKEDIN_SEARCH_BY_ICONS[mode],
                  }))}
                />
                <Input
                  placeholder={LINKEDIN_SEARCH_BY_LABELS[linkedin.searchBy].placeholder}
                  value={linkedin.searchQuery}
                  onChange={(e) => linkedin.setSearchQuery(e.target.value)}
                  className="rounded-xl transition-all focus:shadow-card"
                />
                <p className="text-xs text-muted-foreground">
                  💡 Busca na camada pública do LinkedIn — sem login e sem risco de banimento de conta.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Localização (opcional)
                </Label>

                <QuickSelectLocations
                  selectedLocation={linkedin.location}
                  onSelect={(loc) => linkedin.setLocation(loc)}
                />

                <LocationCascade
                  value={linkedin.location}
                  onChange={(loc) => linkedin.setLocation(loc)}
                />
              </div>

              {/* Campos opcionais mudam conforme "Buscar por": cada modo destaca os
                  filtros que fazem sentido para aquele termo de busca principal. */}
              {linkedin.searchBy === 'pessoa' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="linkedinJobTitles" className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      Cargos-alvo (opcional)
                    </Label>
                    <Input
                      id="linkedinJobTitles"
                      placeholder="Marketing Manager, CMO"
                      value={linkedin.jobTitles}
                      onChange={(e) => linkedin.setJobTitles(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Separe múltiplos cargos por vírgula</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linkedinCompanies" className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      Empresas-alvo (opcional)
                    </Label>
                    <Input
                      id="linkedinCompanies"
                      placeholder="URLs de empresa no LinkedIn, separadas por vírgula"
                      value={linkedin.companies}
                      onChange={(e) => linkedin.setCompanies(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {linkedin.searchBy === 'empresa' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      Segmento / Nicho / Tipo de negócio (opcional)
                    </Label>
                    <LinkedinIndustrySelect
                      selectedIds={linkedin.industryIds}
                      onChange={linkedin.setIndustryIds}
                    />
                    <p className="text-xs text-muted-foreground">
                      💡 Filtra pessoas cuja empresa atua nesses segmentos — útil quando o nome buscado é genérico.
                    </p>
                  </div>
                  <div className="space-y-2 sm:max-w-sm">
                    <Label htmlFor="linkedinJobTitles" className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      Cargos-alvo (opcional)
                    </Label>
                    <Input
                      id="linkedinJobTitles"
                      placeholder="Marketing Manager, CMO"
                      value={linkedin.jobTitles}
                      onChange={(e) => linkedin.setJobTitles(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Separe múltiplos cargos por vírgula</p>
                  </div>
                </div>
              )}

              {linkedin.searchBy === 'cargo' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      Tipos de empresa onde buscar esse cargo (opcional)
                    </Label>
                    <LinkedinIndustrySelect
                      selectedIds={linkedin.industryIds}
                      onChange={linkedin.setIndustryIds}
                    />
                  </div>
                  <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20 sm:max-w-sm">
                    <Label htmlFor="linkedinCompanies" className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-primary" />
                      Busca direta por Nome da Empresa
                      <Badge variant="secondary" className="text-[10px]">Opcional</Badge>
                    </Label>
                    <Input
                      id="linkedinCompanies"
                      placeholder="URLs de empresa no LinkedIn, separadas por vírgula"
                      value={linkedin.companies}
                      onChange={(e) => linkedin.setCompanies(e.target.value)}
                      className="border-primary/30"
                    />
                    <p className="text-xs text-muted-foreground">
                      💡 Assim como na busca do Google Maps: informe a(s) empresa(s) exata(s) para restringir a busca desse cargo a elas.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2 max-w-xs">
                <Label htmlFor="linkedinMaxItems" className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  Máximo de perfis
                </Label>
                <Input
                  id="linkedinMaxItems"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={maxItemsInput}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setMaxItemsInput(digits);
                    if (digits !== "") {
                      linkedin.setMaxItems(parseInt(digits, 10));
                    }
                  }}
                  onBlur={() => {
                    const parsed = parseInt(maxItemsInput, 10);
                    const clamped = Math.min(100, Math.max(1, Number.isFinite(parsed) ? parsed : 20));
                    setMaxItemsInput(String(clamped));
                    linkedin.setMaxItems(clamped);
                  }}
                />
                <p className="text-xs text-muted-foreground">Digite a quantidade desejada — de 1 a 100 perfis</p>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border max-w-md">
                <Switch
                  id="linkedinFindEmail"
                  checked={linkedin.findEmail}
                  onCheckedChange={linkedin.setFindEmail}
                />
                <div className="space-y-1">
                  <Label htmlFor="linkedinFindEmail" className="text-sm cursor-pointer">
                    Buscar email (custo extra por perfil)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    💡 O LinkedIn não expõe email/telefone publicamente — isso faz uma busca/validação de email
                    independente (não é dado do próprio LinkedIn). Sem isso, o perfil vem só com nome, cargo, empresa e localização.
                  </p>
                </div>
              </div>
            </div>

            <Button
              type="button"
              onClick={linkedin.search}
              disabled={linkedin.isSearching}
              className="w-full gradient-primary hover:opacity-90 transition-all shadow-card hover:shadow-elevated"
              size="lg"
            >
              {linkedin.isSearching ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Buscando no LinkedIn...
                </>
              ) : (
                <>
                  <Linkedin className="mr-2 h-5 w-5" />
                  Buscar no LinkedIn
                </>
              )}
            </Button>

            {linkedin.result && (
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-semibold">Resultado da busca</h4>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary">{linkedin.result.found} encontrados</Badge>
                    <Badge className="bg-success/10 text-success border border-success/20">{linkedin.result.created} novos</Badge>
                    {linkedin.result.skippedDuplicate > 0 && (
                      <Badge variant="outline">{linkedin.result.skippedDuplicate} já existiam</Badge>
                    )}
                    {linkedin.result.skippedSuppressed > 0 && (
                      <Badge variant="destructive">{linkedin.result.skippedSuppressed} suprimidos</Badge>
                    )}
                  </div>
                </div>

                {linkedin.result.contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum contato novo — todos os perfis encontrados já existiam na base.
                  </p>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-sm min-w-[860px]">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nome</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Cargo</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Empresa</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Telefone</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Perfil</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {linkedin.result.contacts.map((contact) => {
                          const hasContactInfo = Boolean(contact.email || contact.phone);
                          return (
                            <tr key={contact.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2 font-medium whitespace-nowrap">{contact.name}</td>
                              <td className="px-3 py-2 text-muted-foreground">{contact.roleTitle ?? '—'}</td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {contact.companyName ? (
                                  <span className="flex items-center gap-1 whitespace-nowrap">
                                    <Building2 className="h-3 w-3" />
                                    {contact.companyName}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{contact.email ?? '—'}</td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{contact.phone ?? '—'}</td>
                              <td className="px-3 py-2">
                                <a
                                  href={contact.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1 whitespace-nowrap"
                                >
                                  Ver perfil <ExternalLink className="h-3 w-3" />
                                </a>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    title="Copia uma mensagem sugerida e abre o perfil pra você colar manualmente"
                                    onClick={() => {
                                      const message = buildLinkedinOutreachMessage(contact.name, contact.roleTitle, contact.companyName);
                                      navigator.clipboard.writeText(message).then(() => {
                                        toast.success("Mensagem copiada!", {
                                          description: "Cole na caixa de mensagem do LinkedIn — o envio é manual, como de costume.",
                                        });
                                      }).catch(() => {
                                        toast.error("Não foi possível copiar a mensagem");
                                      });
                                      window.open(contact.linkedinUrl, '_blank', 'noopener,noreferrer');
                                    }}
                                  >
                                    <Copy className="h-3 w-3" />
                                    Copiar mensagem
                                  </Button>
                                  {!hasContactInfo && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1"
                                      disabled={linkedin.enrichingContactId === contact.id}
                                      onClick={() => linkedin.enrichContact(contact)}
                                    >
                                      {linkedin.enrichingContactId === contact.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Sparkles className="h-3 w-3" />
                                      )}
                                      Enriquecer
                                    </Button>
                                  )}
                                  {contact.convertedLeadId ? (
                                    <Badge variant="outline" className="gap-1">
                                      <Check className="h-3 w-3" /> No CRM
                                    </Badge>
                                  ) : (
                                    <Button
                                      size="sm"
                                      className="gap-1"
                                      disabled={linkedin.promotingContactId === contact.id}
                                      onClick={() => linkedin.promoteContact(contact)}
                                    >
                                      {linkedin.promotingContactId === contact.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <UserPlus className="h-3 w-3" />
                                      )}
                                      Enviar para o CRM
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
