import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { n8nMcp } from "@/lib/n8nMcp";
import { DashboardMetrics } from "@/types/prospection";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, LayoutDashboard } from "lucide-react";
import toast from "react-hot-toast";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { LeadsByStatusChart } from "@/components/dashboard/LeadsByStatusChart";
import { LeadsByOriginChart } from "@/components/dashboard/LeadsByOriginChart";
import { LeadsTimeline } from "@/components/dashboard/LeadsTimeline";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { SkeletonCard, SkeletonChart } from "@/components/ui/loading-skeleton";

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
      toast.error(result.message || "Erro ao carregar métricas");
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
      <motion.div
        className="container mx-auto px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28 }}
      >
        <div className="flex justify-end mb-6">
          <div className="h-9 w-32 bg-muted animate-pulse rounded-md" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </motion.div>
    );
  }

  if (!metrics) {
    return (
      <motion.div
        className="flex items-center justify-center min-h-[60vh]"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28 }}
      >
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
      </motion.div>
    );
  }

  return (
    <motion.div
      className="container mx-auto px-4 py-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28 }}
    >
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
    </motion.div>
  );
};

export default Dashboard;
