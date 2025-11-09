import { DashboardMetrics } from "@/types/prospection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart } from "lucide-react";
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";

interface LeadsByOriginChartProps {
  metrics: DashboardMetrics;
}

const COLORS = [
  "hsl(217 91% 60%)",
  "hsl(142 76% 36%)",
  "hsl(45 93% 47%)",
  "hsl(262 83% 58%)",
  "hsl(0 84% 60%)",
  "hsl(173 58% 39%)",
];

export const LeadsByOriginChart = ({ metrics }: LeadsByOriginChartProps) => {
  const data = Object.entries(metrics.leadsPorOrigem).map(([origem, count]) => ({
    name: origem,
    value: count,
  }));

  const chartConfig = {
    value: {
      label: "Leads",
    },
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <PieChart className="h-4 w-4 text-accent" />
          </div>
          <CardTitle>Leads por Origem</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="hsl(var(--primary))"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
            </RechartsPieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};
