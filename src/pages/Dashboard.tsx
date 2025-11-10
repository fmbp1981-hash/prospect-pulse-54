import { useState, useEffect } from "react";
import { n8nMcp } from "@/lib/n8nMcp";
import { DashboardMetrics } from "@/types/prospection";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
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
    <div className="container mx-auto px-4 py-8">
      {/* Sync Button */}
      <div className="flex justify-end mb-6">
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
    </div>
  );
};

export default Dashboard;
