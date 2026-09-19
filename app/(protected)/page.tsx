'use client';

import { useState, useEffect } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import { motion } from "framer-motion";
import { ProspectionForm } from "@/components/ProspectionForm";
import { SearchHistory } from "@/components/SearchHistory";
import { QuickStats } from "@/components/QuickStats";
import { ProspectionFormData, ProspectionSearch } from "@/types/prospection";
import { Rocket, TrendingUp, Database, Zap, Radar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { historyService } from "@/lib/history";
import { useAuth } from "@/contexts/AuthContext";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export default function HomePage() {
  const [searches, setSearches] = useState<ProspectionSearch[]>([]);

  const { user } = useAuth();
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return;
      try {
        const [gmnHistory, linkedinHistory] = await Promise.all([
          historyService.getHistory(),
          historyService.getLinkedinHistory().catch((error) => {
            console.error("Failed to load LinkedIn history:", error);
            return [] as ProspectionSearch[];
          }),
        ]);

        const merged = [...gmnHistory, ...linkedinHistory].sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
        );
        setSearches(merged);
      } catch (error) {
        console.error("Failed to load history:", error);
        toast.error("Erro ao carregar histórico");
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [user]);

  const handleNewSearch = async (data: ProspectionFormData & {
    savedCount?: number;
    channel?: ProspectionSearch['channel'];
    linkedinJobId?: string;
    linkedinSummary?: ProspectionSearch['linkedinSummary'];
  }) => {
    if (data.channel === 'linkedin') {
      // O job de LinkedIn já é persistido pelo próprio endpoint de busca
      // (prospecting_jobs); aqui só refletimos o resultado no histórico local.
      const linkedinSearch: ProspectionSearch = {
        id: data.linkedinJobId ?? Date.now().toString(),
        channel: 'linkedin',
        niche: data.niche,
        location: data.location,
        quantity: data.quantity,
        timestamp: new Date(),
        status: 'completed',
        savedCount: data.savedCount,
        linkedinJobId: data.linkedinJobId,
        linkedinSummary: data.linkedinSummary,
      };
      setSearches(prev => [linkedinSearch, ...prev]);
      return;
    }

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

  const handleReprocessLinkedinSearch = async (search: ProspectionSearch) => {
    if (!search.linkedinJobId) {
      toast.error("Busca inválida", {
        description: "Esta entrada do histórico não possui um job de LinkedIn válido.",
      });
      return;
    }

    const loadingToast = toast.loading("Reprocessando busca no LinkedIn...", {
      description: `Buscando "${search.niche}" novamente...`,
      duration: Infinity,
    });

    try {
      const res = await fetch(`/api/prospecting/linkedin/history/${search.linkedinJobId}/reprocess`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Erro ao reprocessar busca no LinkedIn");
      }

      const summary = json.data as { found: number; created: number };
      toast.success("Busca no LinkedIn reprocessada com sucesso!", {
        id: loadingToast,
        description: `${summary.found} perfis encontrados, ${summary.created} novos.`,
        duration: 5000,
      });

      const updatedSearches = searches.map(s =>
        s.id === search.id ? { ...s, timestamp: new Date() } : s
      );
      setSearches(updatedSearches);
    } catch (error) {
      toast.error("Erro ao reprocessar busca no LinkedIn", {
        id: loadingToast,
        description: error instanceof Error ? error.message : "Erro desconhecido",
        duration: 6000,
      });
      throw error;
    }
  };

  const handleReprocessSearch = async (search: ProspectionSearch) => {
    if (search.channel === 'linkedin') {
      return handleReprocessLinkedinSearch(search);
    }

    // Validate before invoking edge function
    const locationObj = typeof search.location === 'object' ? search.location : null;
    const hasValidNiche = search.niche && search.niche.trim().length > 0;
    const hasValidLocation = typeof search.location === 'string'
      ? search.location.trim().length > 0
      : locationObj?.city && locationObj.city.trim().length > 0;

    if (!hasValidNiche || !hasValidLocation) {
      toast.error("Busca inválida", {
        description: "Esta entrada do histórico não possui nicho ou localização válidos.",
      });
      return;
    }

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
          user_id: user?.id,
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
      <section className="relative mb-14 overflow-hidden rounded-3xl border border-primary/15 bg-card">
        {/* Textura: grade de pontos + wash radial na cor primária, contida ao painel */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.25]"
          style={{
            backgroundImage: "radial-gradient(hsl(var(--primary) / 0.35) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "radial-gradient(ellipse 80% 60% at 20% 20%, black, transparent)",
          }}
        />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative grid gap-10 px-6 py-12 md:px-12 md:py-16 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="mb-5 inline-flex items-center gap-2 text-primary">
              <Radar className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Central de Prospecção</span>
            </div>

            <h1
              className={`${display.className} text-4xl leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl`}
            >
              Encontre seus leads ideais{" "}
              <span className="inline-block -rotate-1 rounded-lg bg-primary px-3 py-0.5 text-primary-foreground">
                em segundos
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Busque negócios reais no Google Places ou pessoas no LinkedIn, enriqueça com IA
              e monte seu banco de leads qualificados — sem sair desta tela.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.12 }}
          >
            <QuickStats />
          </motion.div>
        </div>
      </section>

      {/* Capability Rail — um único painel dividido, não cartões repetidos */}
      <motion.section
        initial="hidden"
        animate="show"
        variants={fadeUp}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
        className="mb-14 grid divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        <div className="flex items-start gap-4 p-6">
          <Database className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h3 className="font-semibold text-foreground">Google Places API</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Milhões de empresas reais com dados verificados
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-6">
          <Zap className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <h3 className="font-semibold text-foreground">Automação Inteligente</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Mensagens personalizadas com IA, disparadas via WhatsApp
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-6">
          <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <h3 className="font-semibold text-foreground">Dashboard Analítico</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Métricas de conversão acompanhadas em tempo real
            </p>
          </div>
        </div>
      </motion.section>

      {/* Form and History - Vertical Layout */}
      <div className="mx-auto max-w-4xl space-y-8">
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
      <section className="mx-auto mt-20 max-w-5xl">
        <div className="mb-10">
          <h2 className={`${display.className} text-2xl text-foreground md:text-3xl`}>
            Funcionalidades da Plataforma
          </h2>
          <p className="mt-2 text-muted-foreground">
            Ferramentas para automatizar sua prospecção do primeiro contato ao fechamento
          </p>
        </div>

        <div className="grid divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="flex items-start gap-4 p-6">
            <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                Dashboard
                <span className="rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">Ativo</span>
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Métricas de conversão, gráficos interativos e performance em tempo real
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-6">
            <Zap className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                Enriquecimento IA
                <span className="rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">Novo</span>
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Mensagens personalizadas e análise de dados geradas automaticamente
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-6">
            <Rocket className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                Campanhas
                <span className="rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">Próxima fase</span>
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Sequências de mensagens e automações de follow-up para seus leads
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-6">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                Integração CRM
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Futuro</span>
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Sincronização automática com Pipedrive, HubSpot e RD Station
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
