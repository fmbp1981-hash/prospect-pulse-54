import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, LayoutDashboard, Download } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { supabaseCRM } from "@/lib/supabaseCRM";
import { Lead } from "@/types/prospection";
import { AdvancedMetrics, ConversionFunnel } from "@/components/dashboard/AdvancedMetrics";
import { PeriodFilter, PeriodType, getDateRangeFromPeriod, isLeadInPeriod } from "@/components/dashboard/PeriodFilter";
import { TimelineChart } from "@/components/dashboard/TimelineChart";
import { DateRange } from "react-day-picker";
import { useUserRole } from "@/hooks/useUserRole";
import { RoleBadge } from "@/components/RoleBadge";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const DashboardV2 = () => {
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

  // Calcular métricas
  const metrics = useMemo(() => {
    const total = filteredLeads.length;
    const withWhatsApp = filteredLeads.filter((l) => l.whatsapp && l.whatsapp.trim() !== "").length;
    const whatsappSent = filteredLeads.filter((l) => l.statusMsgWA === "sent" || l.statusMsgWA === "failed").length;
    const whatsappFailed = filteredLeads.filter((l) => l.statusMsgWA === "failed").length;
    const whatsappSuccess = whatsappSent - whatsappFailed;

    // Leads por status
    const statusMap = new Map<string, number>();
    filteredLeads.forEach((lead) => {
      const status = lead.status || "Sem Status";
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    });
    const leadsByStatus = Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    // Leads por categoria
    const categoryMap = new Map<string, number>();
    filteredLeads.forEach((lead) => {
      const cat = lead.categoria || "Sem Categoria";
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    });
    const leadsByCategory = Array.from(categoryMap.entries())
      .map(([categoria, count]) => ({ categoria, count }))
      .sort((a, b) => b.count - a.count);

    // Leads por cidade
    const cityMap = new Map<string, number>();
    filteredLeads.forEach((lead) => {
      const city = lead.cidade || "Sem Cidade";
      cityMap.set(city, (cityMap.get(city) || 0) + 1);
    });
    const leadsByCity = Array.from(cityMap.entries())
      .map(([cidade, count]) => ({ cidade, count }))
      .sort((a, b) => b.count - a.count);

    // Média de leads por dia
    const daysInPeriod = selectedPeriod === "7d" ? 7 : selectedPeriod === "30d" ? 30 : selectedPeriod === "90d" ? 90 : 30;
    const avgLeadsPerDay = total / daysInPeriod;

    return {
      total,
      withWhatsApp,
      whatsappSent,
      whatsappFailed,
      whatsappSuccess,
      conversionRate: total > 0 ? (whatsappSuccess / total) * 100 : 0,
      avgLeadsPerDay,
      leadsByStatus,
      leadsByCategory,
      leadsByCity,
    };
  }, [filteredLeads, selectedPeriod]);

  if (isLoading) {
    return (
      <motion.div
        className="flex items-center justify-center min-h-[60vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </motion.div>
    );
  }

  if (allLeads.length === 0) {
    return (
      <motion.div
        className="flex items-center justify-center min-h-[60vh]"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="text-center max-w-md">
          <LayoutDashboard className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Nenhum Lead Prospectado</h2>
          <p className="text-muted-foreground mb-6">
            Faça sua primeira prospecção para visualizar as métricas do dashboard
          </p>
          <Button onClick={() => (window.location.href = "/")}>
            Iniciar Prospecção
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="container mx-auto px-4 py-8 space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            Dashboard Analítico
            {isAdmin && <RoleBadge showIcon className="text-xs" />}
          </h1>
          <p className="text-muted-foreground">
            Análise completa dos seus leads prospectados
          </p>
        </div>
        <Button onClick={handleSync} variant="outline" size="sm" disabled={isSyncing}>
          {isSyncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Atualizando...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </>
          )}
        </Button>
      </div>

      {/* Period Filter */}
      <PeriodFilter
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
      />

      {/* Advanced Metrics */}
      <AdvancedMetrics
        totalLeads={metrics.total}
        leadsWithWhatsApp={metrics.withWhatsApp}
        whatsappSent={metrics.whatsappSent}
        whatsappFailed={metrics.whatsappFailed}
        conversionRate={metrics.conversionRate}
        avgLeadsPerDay={metrics.avgLeadsPerDay}
      />

      {/* Timeline Chart */}
      <TimelineChart
        leads={filteredLeads}
        days={selectedPeriod === "7d" ? 7 : selectedPeriod === "30d" ? 30 : selectedPeriod === "90d" ? 90 : 30}
      />

      {/* Conversion Funnel and Status */}
      <div className="grid lg:grid-cols-2 gap-6">
        <ConversionFunnel
          totalLeads={metrics.total}
          leadsWithWhatsApp={metrics.withWhatsApp}
          whatsappSent={metrics.whatsappSent}
          whatsappSuccess={metrics.whatsappSuccess}
        />

        {/* Leads por Status */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={metrics.leadsByStatus}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ status, count }) => `${status}: ${count}`}
                >
                  {metrics.leadsByStatus.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Categories and Cities */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Categorias */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Categorias</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={metrics.leadsByCategory.slice(0, 10)}>
                <XAxis dataKey="categoria" angle={-45} textAnchor="end" height={100} fontSize={12} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Cidades */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Cidades</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={metrics.leadsByCity.slice(0, 10)} layout="vertical">
                <XAxis type="number" />
                <YAxis dataKey="cidade" type="category" width={120} fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Export Button */}
      {filteredLeads.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar Relatório (em breve)
          </Button>
        </div>
      )}
    </motion.div>
  );
};

export default DashboardV2;
