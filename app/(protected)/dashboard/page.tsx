'use client';

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

    return {
      total,
      withWhatsApp,
      whatsappRate: total > 0 ? Math.round((withWhatsApp / total) * 100) : 0,
      whatsappSent,
      whatsappSuccess,
      whatsappFailed,
      leadsByStatus,
      leadsByCategory: leadsByCategory.slice(0, 10),
      leadsByCity: leadsByCity.slice(0, 10),
    };
  }, [filteredLeads]);

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
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <LayoutDashboard className="h-10 w-10 text-primary" />
              Dashboard
            </h1>
            <RoleBadge />
          </div>
          <p className="text-xl text-muted-foreground">
            Visão geral de leads e métricas de conversão
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
            onClick={handleSync}
            disabled={isSyncing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </motion.div>

      {/* Metrics Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{metrics.total}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Com WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{metrics.withWhatsApp}</p>
            <p className="text-sm text-muted-foreground">{metrics.whatsappRate}% do total</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Mensagens Enviadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">{metrics.whatsappSuccess}</p>
            <p className="text-sm text-muted-foreground">{metrics.whatsappFailed} com falha</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Categorias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">
              {metrics.leadsByCategory.length}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Advanced Metrics */}
      <AdvancedMetrics
        totalLeads={metrics.total}
        leadsWithWhatsApp={metrics.withWhatsApp}
        whatsappSent={metrics.whatsappSent}
        whatsappFailed={metrics.whatsappFailed}
        conversionRate={metrics.whatsappRate}
        avgLeadsPerDay={metrics.total / 30}
      />

      {/* Conversion Funnel */}
      <ConversionFunnel
        totalLeads={metrics.total}
        leadsWithWhatsApp={metrics.withWhatsApp}
        whatsappSent={metrics.whatsappSent}
        whatsappSuccess={metrics.whatsappSuccess}
      />

      {/* Timeline Chart */}
      <TimelineChart leads={filteredLeads} />

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Leads by Status - Pie Chart */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Leads por Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.leadsByStatus}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                      nameKey="status"
                      label={({ status, percent }) =>
                        `${status}: ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {metrics.leadsByStatus.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Leads by Category - Bar Chart */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Categorias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={metrics.leadsByCategory}
                    layout="vertical"
                    margin={{ left: 100 }}
                  >
                    <XAxis type="number" />
                    <YAxis
                      type="category"
                      dataKey="categoria"
                      width={100}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Cities Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Cidades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.leadsByCity}>
                  <XAxis dataKey="cidade" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
