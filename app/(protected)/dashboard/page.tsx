'use client';

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { supabaseCRM } from "@/lib/supabaseCRM";
import { Lead } from "@/types/prospection";
import { ConversionMetrics } from "@/components/dashboard/ConversionMetrics";
import { PerformanceOverview } from "@/components/dashboard/PerformanceOverview";
import { InsightsCharts } from "@/components/dashboard/InsightsCharts";
import { PeriodFilter, PeriodType, getDateRangeFromPeriod, isLeadInPeriod } from "@/components/dashboard/PeriodFilter";
import { DateRange } from "react-day-picker";
import { useUserRole } from "@/hooks/useUserRole";
import { RoleBadge } from "@/components/RoleBadge";

export default function DashboardPage() {
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("30d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const { role, isAdmin } = useUserRole();

  const loadLeads = async () => {
    setIsLoading(true);
    try {
      const result = await supabaseCRM.syncAllLeads();
      if (result.success) {
        setAllLeads(result.leads);
        toast.success("Dashboard atualizado!");
      } else {
        toast.error("Erro ao carregar dados");
      }
    } catch (error) {
      console.error("Error loading leads:", error);
      toast.error("Erro ao carregar métricas");
    }
    setIsLoading(false);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    await loadLeads();
    setIsSyncing(false);
  };

  useEffect(() => {
    loadLeads();
  }, []);

  // Filtrar leads por período
  const filteredLeads = useMemo(() => {
    const dateRange = getDateRangeFromPeriod(selectedPeriod, customRange);
    if (!dateRange) return allLeads;

    return allLeads.filter((lead) =>
      lead.data ? isLeadInPeriod(lead.data, dateRange) : false
    );
  }, [allLeads, selectedPeriod, customRange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <LayoutDashboard className="h-6 w-6 text-primary" />
              Dashboard
            </h1>
            <RoleBadge />
          </div>
          <p className="text-sm text-muted-foreground">
            Métricas de conversão e performance do funil de vendas
          </p>
        </div>

        <div className="flex items-center gap-3">
          <PeriodFilter
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />

          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </motion.div>

      {/* Conversion Metrics — KPIs + Pipeline + Conversion Rates */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <ConversionMetrics leads={filteredLeads} />
      </motion.div>

      {/* Performance Overview — Weekly Area Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <PerformanceOverview leads={filteredLeads} />
      </motion.div>

      {/* Insights Charts — Categories + Status Donut */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <InsightsCharts leads={filteredLeads} />
      </motion.div>
    </div>
  );
}
