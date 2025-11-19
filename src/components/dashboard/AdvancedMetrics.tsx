import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Target, MessageCircle, CheckCircle2, XCircle, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon: React.ElementType;
  iconColor?: string;
}

function MetricCard({ title, value, description, trend, icon: Icon, iconColor = "text-primary" }: MetricCardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value === 0) return <Minus className="h-4 w-4 text-muted-foreground" />;
    return trend.isPositive
      ? <TrendingUp className="h-4 w-4 text-green-500" />
      : <TrendingDown className="h-4 w-4 text-red-500" />;
  };

  const getTrendColor = () => {
    if (!trend || trend.value === 0) return "text-muted-foreground";
    return trend.isPositive ? "text-green-500" : "text-red-500";
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <div className={`flex items-center gap-1 mt-2 text-sm ${getTrendColor()}`}>
            {getTrendIcon()}
            <span className="font-medium">
              {Math.abs(trend.value)}% vs período anterior
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AdvancedMetricsProps {
  totalLeads: number;
  leadsWithWhatsApp: number;
  whatsappSent: number;
  whatsappFailed: number;
  conversionRate: number;
  avgLeadsPerDay: number;
  trends?: {
    totalLeads: number;
    whatsappSent: number;
    conversionRate: number;
  };
}

export function AdvancedMetrics({
  totalLeads,
  leadsWithWhatsApp,
  whatsappSent,
  whatsappFailed,
  conversionRate,
  avgLeadsPerDay,
  trends,
}: AdvancedMetricsProps) {
  const whatsappSuccess = whatsappSent - whatsappFailed;
  const whatsappSuccessRate = whatsappSent > 0
    ? ((whatsappSuccess / whatsappSent) * 100).toFixed(1)
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Total de Leads"
        value={totalLeads.toLocaleString()}
        description={`${avgLeadsPerDay.toFixed(1)} leads/dia em média`}
        icon={Users}
        iconColor="text-blue-500"
        trend={trends ? {
          value: trends.totalLeads,
          isPositive: trends.totalLeads > 0,
        } : undefined}
      />

      <MetricCard
        title="Leads com WhatsApp"
        value={leadsWithWhatsApp.toLocaleString()}
        description={`${((leadsWithWhatsApp / totalLeads) * 100).toFixed(1)}% do total`}
        icon={MessageCircle}
        iconColor="text-green-500"
      />

      <MetricCard
        title="Mensagens Enviadas"
        value={whatsappSent.toLocaleString()}
        description={`${whatsappSuccess} sucesso, ${whatsappFailed} falhas`}
        icon={CheckCircle2}
        iconColor="text-purple-500"
        trend={trends ? {
          value: trends.whatsappSent,
          isPositive: trends.whatsappSent > 0,
        } : undefined}
      />

      <MetricCard
        title="Taxa de Sucesso WA"
        value={`${whatsappSuccessRate}%`}
        description={`${whatsappSuccess} de ${whatsappSent} enviados`}
        icon={Target}
        iconColor="text-orange-500"
      />
    </div>
  );
}

interface ConversionFunnelProps {
  totalLeads: number;
  leadsWithWhatsApp: number;
  whatsappSent: number;
  whatsappSuccess: number;
}

export function ConversionFunnel({
  totalLeads,
  leadsWithWhatsApp,
  whatsappSent,
  whatsappSuccess,
}: ConversionFunnelProps) {
  const stages = [
    {
      name: "Leads Prospectados",
      value: totalLeads,
      percentage: 100,
      color: "bg-blue-500",
    },
    {
      name: "Com WhatsApp",
      value: leadsWithWhatsApp,
      percentage: (leadsWithWhatsApp / totalLeads) * 100,
      color: "bg-green-500",
    },
    {
      name: "Mensagens Enviadas",
      value: whatsappSent,
      percentage: (whatsappSent / totalLeads) * 100,
      color: "bg-purple-500",
    },
    {
      name: "Envios Bem-Sucedidos",
      value: whatsappSuccess,
      percentage: (whatsappSuccess / totalLeads) * 100,
      color: "bg-orange-500",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funil de Conversão</CardTitle>
        <CardDescription>
          Visualize a jornada dos leads desde a prospecção até o envio bem-sucedido
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {stages.map((stage, index) => (
            <div key={stage.name} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{stage.name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{stage.value.toLocaleString()}</Badge>
                  <span className="text-muted-foreground">
                    {stage.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="relative h-8 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${stage.color} transition-all duration-500 flex items-center justify-center text-white text-xs font-medium`}
                  style={{ width: `${stage.percentage}%` }}
                >
                  {stage.percentage > 15 && `${stage.percentage.toFixed(0)}%`}
                </div>
              </div>
              {index < stages.length - 1 && (
                <div className="text-xs text-muted-foreground text-center">
                  ↓ {((stages[index + 1].value / stage.value) * 100).toFixed(1)}% convertido
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
