import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserPlus, RefreshCw, Phone, Mail, Globe } from "lucide-react";
import { DashboardMetrics } from "@/lib/dashboardMetrics";

interface MetricsGridProps {
  metrics: DashboardMetrics;
}

export function MetricsGrid({ metrics }: MetricsGridProps) {
  const cards = [
    {
      title: "Total de Leads",
      value: metrics.totalLeads,
      icon: Users,
      description: "Leads prospectados",
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Leads Novos",
      value: metrics.newLeads,
      icon: UserPlus,
      description: "Nunca prospectados",
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Leads Recorrentes",
      value: metrics.recurrentLeads,
      icon: RefreshCw,
      description: "Já prospectados",
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
    {
      title: "Com Telefone",
      value: metrics.leadsWithPhone,
      icon: Phone,
      description: `${((metrics.leadsWithPhone / metrics.totalLeads) * 100 || 0).toFixed(1)}% dos leads`,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      title: "Com Email",
      value: metrics.leadsWithEmail,
      icon: Mail,
      description: `${((metrics.leadsWithEmail / metrics.totalLeads) * 100 || 0).toFixed(1)}% dos leads`,
      color: "text-pink-600",
      bgColor: "bg-pink-100",
    },
    {
      title: "Com Website",
      value: metrics.leadsWithWebsite,
      icon: Globe,
      description: `${((metrics.leadsWithWebsite / metrics.totalLeads) * 100 || 0).toFixed(1)}% dos leads`,
      color: "text-indigo-600",
      bgColor: "bg-indigo-100",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{card.value.toLocaleString('pt-BR')}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
