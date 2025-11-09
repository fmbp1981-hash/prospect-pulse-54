import { DashboardMetrics } from "@/types/prospection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

interface LeadsTimelineProps {
  metrics: DashboardMetrics;
}

export const LeadsTimeline = ({ metrics }: LeadsTimelineProps) => {
  // Simulando dados de timeline (em produção viriam do backend)
  const data = [
    { periodo: "Jan", novos: metrics.novoLeads * 0.3, convertidos: metrics.fechadoGanho * 0.2 },
    { periodo: "Fev", novos: metrics.novoLeads * 0.5, convertidos: metrics.fechadoGanho * 0.3 },
    { periodo: "Mar", novos: metrics.novoLeads * 0.7, convertidos: metrics.fechadoGanho * 0.5 },
    { periodo: "Abr", novos: metrics.novoLeads * 0.9, convertidos: metrics.fechadoGanho * 0.7 },
    { periodo: "Mai", novos: metrics.novoLeads, convertidos: metrics.fechadoGanho },
  ];

  const chartConfig = {
    novos: {
      label: "Novos Leads",
      color: "hsl(var(--primary))",
    },
    convertidos: {
      label: "Convertidos",
      color: "hsl(var(--accent))",
    },
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <CardTitle>Evolução de Leads</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="periodo"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="novos"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="convertidos"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--accent))", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};
