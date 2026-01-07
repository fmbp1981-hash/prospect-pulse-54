'use client';

import { useState, useEffect } from "react";
import { ProspectionForm } from "@/components/ProspectionForm";
import { SearchHistory } from "@/components/SearchHistory";
import { QuickStats } from "@/components/QuickStats";
import { ProspectionFormData, ProspectionSearch } from "@/types/prospection";
import { Rocket, TrendingUp, Database, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { historyService } from "@/lib/history";
import { useAuth } from "@/contexts/AuthContext";

export default function HomePage() {
  const [searches, setSearches] = useState<ProspectionSearch[]>([]);

  const { user } = useAuth();
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return;
      try {
        const history = await historyService.getHistory();
        setSearches(history);
      } catch (error) {
        console.error("Failed to load history:", error);
        toast.error("Erro ao carregar histórico");
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [user]);

  const handleNewSearch = async (data: ProspectionFormData & { savedCount?: number }) => {
    // Optimistic update
    const tempId = Date.now().toString();
    const newSearch: ProspectionSearch = {
      id: tempId,
      ...data,
      timestamp: new Date(),
      status: 'completed',
      savedCount: data.savedCount,
    };

    setSearches(prev => [newSearch, ...prev]);

    try {
      // Save to Supabase
      const savedSearch = await historyService.saveSearch({
        niche: data.niche,
        location: data.location,
        quantity: data.quantity,
        status: 'completed',
        savedCount: data.savedCount,
        user_id: user?.id
      });

      // Replace temp item with real one
      setSearches(prev => prev.map(s => s.id === tempId ? savedSearch : s));
    } catch (error) {
      console.error("Failed to save search history:", error);
      // Don't remove from UI, just warn
      toast.warning("Pesquisa realizada, mas erro ao salvar no histórico");
    }
  };

  const handleClearHistory = async () => {
    try {
      await historyService.clearHistory();
      setSearches([]);
      toast.success("Histórico apagado com sucesso");
    } catch (error) {
      console.error("Failed to clear history:", error);
      toast.error("Erro ao apagar histórico");
    }
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
      <section className="text-center mb-12 animate-fade-in relative">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent opacity-50 blur-3xl"></div>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 hover:bg-primary/15 transition-colors cursor-default">
          <Sparkles className="h-4 w-4" />
          Nova Versão 2.0 Disponível
        </div>

        <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
          Encontre Seus Leads Ideais
          <br />
          <span className="text-primary">Em Segundos</span>
        </h2>

        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
          Busque automaticamente negócios no Google Places, enriqueça com IA e crie seu banco de dados de leads qualificados para vendas.
        </p>

        {/* Quick Stats */}
        <div className="max-w-3xl mx-auto">
          <QuickStats />
        </div>
      </section>

      {/* Features Grid */}
      <section className="grid md:grid-cols-3 gap-6 mb-12 animate-fade-in">
        <div className="p-6 rounded-xl bg-card border shadow-sm hover:shadow-md transition-shadow group">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-semibold mb-2">Google Places API</h3>
          <p className="text-sm text-muted-foreground">
            Acesse milhões de empresas reais com dados verificados
          </p>
        </div>

        <div className="p-6 rounded-xl bg-card border shadow-sm hover:shadow-md transition-shadow group">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-semibold mb-2">Automação Inteligente</h3>
          <p className="text-sm text-muted-foreground">
            Gere mensagens personalizadas com IA e dispare via WhatsApp
          </p>
        </div>

        <div className="p-6 rounded-xl bg-card border shadow-sm hover:shadow-md transition-shadow group">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-semibold mb-2">Dashboard Analítico</h3>
          <p className="text-sm text-muted-foreground">
            Acompanhe métricas de conversão em tempo real
          </p>
        </div>
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
            isLoading={isLoadingHistory}
          />
        </div>
      </div>

      {/* Features Section */}
      <section className="mt-20 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h3 className="text-2xl font-bold mb-4">Funcionalidades da Plataforma</h3>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Ferramentas poderosas para automatizar sua prospecção e aumentar suas vendas
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          <div className="p-6 rounded-xl border bg-card shadow-sm hover:shadow-md transition-all group">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              Dashboard
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">Ativo</span>
            </h4>
            <p className="text-sm text-muted-foreground">
              Visualize métricas de conversão, gráficos interativos e performance em tempo real
            </p>
          </div>

          <div className="p-6 rounded-xl border bg-card shadow-sm hover:shadow-md transition-all group">
            <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Zap className="h-6 w-6 text-accent" />
            </div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              Enriquecimento IA
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">Novo</span>
            </h4>
            <p className="text-sm text-muted-foreground">
              Geração automática de mensagens personalizadas e análise de dados com IA
            </p>
          </div>

          <div className="p-6 rounded-xl border bg-card shadow-sm hover:shadow-md transition-all group">
            <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Rocket className="h-6 w-6 text-warning" />
            </div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              Campanhas
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">Próxima Fase</span>
            </h4>
            <p className="text-sm text-muted-foreground">
              Crie sequências de mensagens e automações de follow-up para seus leads
            </p>
          </div>

          <div className="p-6 rounded-xl border bg-card shadow-sm hover:shadow-md transition-all group">
            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              Integração CRM
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Futuro</span>
            </h4>
            <p className="text-sm text-muted-foreground">
              Conecte com Pipedrive, HubSpot e RD Station para sincronização automática
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
