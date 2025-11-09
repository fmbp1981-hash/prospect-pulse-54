import { DashboardMetrics } from "@/types/prospection";
import { Card, CardContent } from "@/components/ui/card";
import { Users, UserPlus, TrendingUp, DollarSign, Target, MessageSquare } from "lucide-react";

interface MetricsCardsProps {
  metrics: DashboardMetrics;
}

export const MetricsCards = ({ metrics }: MetricsCardsProps) => {
  const cards = [
    {
      title: "Total de Leads",
      value: metrics.totalLeads,
      icon: Users,
      bgClass: "bg-primary/10",
      iconClass: "text-primary",
    },
    {
      title: "Novos Leads",
      value: metrics.novoLeads,
      icon: UserPlus,
      bgClass: "bg-accent/10",
      iconClass: "text-accent",
    },
    {
      title: "Em Negociação",
      value: metrics.emNegociacao,
      icon: TrendingUp,
      bgClass: "bg-primary/10",
      iconClass: "text-primary",
    },
    {
      title: "Fechado Ganho",
      value: metrics.fechadoGanho,
      icon: Target,
      bgClass: "bg-accent/10",
      iconClass: "text-accent",
    },
    {
      title: "Taxa de Conversão",
      value: `${metrics.taxaConversao.toFixed(1)}%`,
      icon: TrendingUp,
      bgClass: "bg-primary/10",
      iconClass: "text-primary",
    },
    {
      title: "Ticket Médio",
      value: `R$ ${metrics.ticketMedioTotal.toLocaleString('pt-BR')}`,
      icon: DollarSign,
      bgClass: "bg-accent/10",
      iconClass: "text-accent",
    },
    {
      title: "Mensagens Enviadas",
      value: metrics.mensagensEnviadas,
      icon: MessageSquare,
      bgClass: "bg-primary/10",
      iconClass: "text-primary",
    },
    {
      title: "Pendentes Envio",
      value: metrics.mensagensPendentes,
      icon: MessageSquare,
      bgClass: "bg-muted/50",
      iconClass: "text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <Card key={index} className="shadow-card hover:shadow-elevated transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{card.title}</p>
                <p className="text-2xl font-bold">{card.value}</p>
              </div>
              <div className={`h-12 w-12 rounded-lg ${card.bgClass} flex items-center justify-center`}>
                <card.icon className={`h-6 w-6 ${card.iconClass}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
