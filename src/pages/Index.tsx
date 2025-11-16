import { useState, useEffect } from "react";
import { ProspectionForm } from "@/components/ProspectionForm";
import { SearchHistory } from "@/components/SearchHistory";
import { ProspectionFormData, ProspectionSearch } from "@/types/prospection";
import { Rocket, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [searches, setSearches] = useState<ProspectionSearch[]>([]);

  useEffect(() => {
    const savedSearches = localStorage.getItem("prospectionSearches");
    if (savedSearches) {
      setSearches(JSON.parse(savedSearches));
    }
  }, []);

  const handleNewSearch = (data: ProspectionFormData) => {
    const newSearch: ProspectionSearch = {
      id: Date.now().toString(),
      ...data,
      timestamp: new Date(),
      status: 'processing',
    };

    const updatedSearches = [newSearch, ...searches];
    setSearches(updatedSearches);
    localStorage.setItem("prospectionSearches", JSON.stringify(updatedSearches));
  };

  const handleClearHistory = () => {
    setSearches([]);
    localStorage.removeItem("prospectionSearches");
  };

  const handleReprocessSearch = async (search: ProspectionSearch) => {
    const loadingToast = toast.loading("Reprocessando prospecção...", {
      description: `Buscando até ${search.quantity} leads novamente...`,
      duration: Infinity,
    });

    try {
      const { data, error } = await supabase.functions.invoke('prospection', {
        body: {
          niche: search.niche,
          location: search.location,
          quantity: search.quantity,
        },
      });

      if (error) throw error;

      toast.success("Prospecção reprocessada com sucesso!", {
        id: loadingToast,
        description: `${data.count} leads encontrados e salvos no banco de dados.`,
        duration: 5000,
      });

      // Atualizar timestamp da pesquisa
      const updatedSearches = searches.map(s => 
        s.id === search.id 
          ? { ...s, timestamp: new Date(), status: 'processing' as const }
          : s
      );
      setSearches(updatedSearches);
      localStorage.setItem("prospectionSearches", JSON.stringify(updatedSearches));
    } catch (error) {
      console.error("Erro ao reprocessar prospecção:", error);
      
      toast.error("Erro ao reprocessar prospecção", {
        id: loadingToast,
        description: error instanceof Error ? error.message : "Erro desconhecido",
        duration: 6000,
      });
      
      throw error;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <section className="text-center mb-12 animate-fade-in">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
          <TrendingUp className="h-4 w-4" />
          Prospecção Automatizada
        </div>
        <h2 className="text-4xl font-bold mb-4 tracking-tight">
          Encontre Seus Leads Ideais
        </h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Busque automaticamente negócios no Google Places e crie seu banco de dados de leads qualificados
        </p>
      </section>

      {/* Form and History - Vertical Layout */}
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Formulário de Prospecção - Largura Completa */}
        <div>
          <ProspectionForm onSearch={handleNewSearch} lastSearch={searches[0]} />
        </div>

        {/* Histórico de Buscas - Abaixo do Formulário */}
        <div>
          <SearchHistory
            searches={searches}
            onClearHistory={handleClearHistory}
            onReprocess={handleReprocessSearch}
          />
        </div>
      </div>

      {/* Features Section */}
      <section className="mt-16 max-w-7xl mx-auto">
        <h3 className="text-2xl font-bold text-center mb-8">Funcionalidades</h3>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-6 rounded-lg border bg-card shadow-card hover:shadow-elevated transition-all">
            <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center mb-4">
              <TrendingUp className="h-6 w-6 text-success" />
            </div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              Dashboard Analítico
              <span className="text-xs px-2 py-1 rounded-full bg-success/20 text-success">Implementado</span>
            </h4>
            <p className="text-sm text-muted-foreground">
              Visualize métricas de conversão, gráficos interativos e performance dos seus leads em tempo real
            </p>
          </div>

          <div className="p-6 rounded-lg border bg-card shadow-card hover:shadow-elevated transition-all">
            <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
              <Rocket className="h-6 w-6 text-accent" />
            </div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              Gestão de Campanhas
              <span className="text-xs px-2 py-1 rounded-full bg-warning/20 text-warning">Em breve</span>
            </h4>
            <p className="text-sm text-muted-foreground">
              Crie, organize e agende múltiplas campanhas de outbound com templates personalizados e automações
            </p>
          </div>

          <div className="p-6 rounded-lg border bg-card shadow-card hover:shadow-elevated transition-all">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              Integração CRM
              <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">Planejado</span>
            </h4>
            <p className="text-sm text-muted-foreground">
              Conecte com Pipedrive, HubSpot, RD Station e outros CRMs para sincronização automática de leads
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
