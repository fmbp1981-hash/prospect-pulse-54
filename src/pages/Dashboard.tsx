import { useState, useEffect } from "react";
import { n8nMcp } from "@/lib/n8nMcp";
import { DashboardMetrics } from "@/types/prospection";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, LayoutDashboard, Table, Home } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { LeadsByStatusChart } from "@/components/dashboard/LeadsByStatusChart";
import { LeadsByOriginChart } from "@/components/dashboard/LeadsByOriginChart";
import { LeadsTimeline } from "@/components/dashboard/LeadsTimeline";
import { RecentActivity } from "@/components/dashboard/RecentActivity";

const Dashboard = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadMetrics = async () => {
    setIsLoading(true);
    const result = await n8nMcp.getMetrics();
    
    if (result.success && result.metrics) {
      setMetrics(result.metrics);
    } else {
      toast.error("Erro ao carregar métricas", {
        description: result.message || "Verifique a configuração do webhook",
      });
    }
    setIsLoading(false);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    await loadMetrics();
    setIsSyncing(false);
    toast.success("Dashboard atualizado com sucesso!");
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="text-center max-w-md">
          <LayoutDashboard className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Configure o CRM</h2>
          <p className="text-muted-foreground mb-6">
            Configure o webhook de sincronização para visualizar as métricas do CRM
          </p>
          <Button onClick={handleSync} disabled={isSyncing}>
            {isSyncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tentar Sincronizar
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50 shadow-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center shadow-card">
                <LayoutDashboard className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Dashboard CRM</h1>
                <p className="text-sm text-muted-foreground">Métricas e análise de leads</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <Home className="mr-2 h-4 w-4" />
                  Início
                </Button>
              </Link>
              <Link to="/leads">
                <Button variant="ghost" size="sm">
                  <Table className="mr-2 h-4 w-4" />
                  Leads
                </Button>
              </Link>
              <Button
                onClick={handleSync}
                variant="outline"
                size="sm"
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Atualizar
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Metrics Cards */}
        <MetricsCards metrics={metrics} />

        {/* Charts Grid */}
        <div className="grid lg:grid-cols-2 gap-8 mt-8">
          <LeadsByStatusChart metrics={metrics} />
          <LeadsByOriginChart metrics={metrics} />
        </div>

        {/* Timeline and Activity */}
        <div className="grid lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2">
            <LeadsTimeline metrics={metrics} />
          </div>
          <div>
            <RecentActivity metrics={metrics} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
