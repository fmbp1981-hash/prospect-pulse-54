import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { getDashboardMetrics, DashboardMetrics } from "@/lib/dashboardMetrics";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { MetricsGrid } from "@/components/dashboard/MetricsGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const Dashboard = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadMetrics = async () => {
    setIsLoading(true);
    try {
      const data = await getDashboardMetrics();
      setMetrics(data);
      toast.success("Dashboard carregado com sucesso!");
    } catch (error) {
      console.error("Error loading metrics:", error);
      toast.error("Erro ao carregar métricas do dashboard");
    }
    setIsLoading(false);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    await loadMetrics();
    setIsSyncing(false);
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  if (isLoading) {
    return (
      <motion.div
        className="flex items-center justify-center min-h-[60vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </motion.div>
    );
  }

  if (!metrics || metrics.totalLeads === 0) {
    return (
      <motion.div
        className="flex items-center justify-center min-h-[60vh]"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <div className="text-center max-w-md">
          <LayoutDashboard className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Nenhum Lead Prospectado</h2>
          <p className="text-muted-foreground mb-6">
            Faça sua primeira prospecção para visualizar as métricas do dashboard
          </p>
          <Button onClick={() => window.location.href = "/"}>
            Iniciar Prospecção
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
      transition={{ duration: 0.28 }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Analítico</h1>
          <p className="text-muted-foreground">Visão geral dos seus leads prospectados</p>
        </div>
        <Button
          onClick={handleSync}
          variant="outline"
          size="sm"
          disabled={isSyncing}
        >
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

      {/* Metrics Cards */}
      <MetricsGrid metrics={metrics} />

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Leads por Status */}
        <Card>
          <CardHeader>
            <CardTitle>Leads por Status</CardTitle>
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
                  label
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
      </div>

      {/* Timeline and Cities */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Timeline */}
        {metrics.leadsTimeline.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Leads nos Últimos 30 Dias</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={metrics.leadsTimeline}>
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Top Cidades */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Cidades</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={metrics.leadsByCity.slice(0, 10)} layout="vertical">
                <XAxis type="number" />
                <YAxis dataKey="cidade" type="category" width={100} fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Leads */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Leads Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {metrics.recentLeads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors">
                <div>
                  <p className="font-medium">{lead.empresa}</p>
                  <p className="text-sm text-muted-foreground">{lead.categoria} • {lead.cidade}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{lead.lead}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default Dashboard;
