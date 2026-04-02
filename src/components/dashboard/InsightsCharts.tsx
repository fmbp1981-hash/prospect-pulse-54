import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lead } from "@/types/prospection";
import { LEAD_STATUS } from "@/lib/constants";
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  PieChart,
  Pie,
} from "recharts";

const DONUT_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4",
  "#ec4899", "#ef4444", "#84cc16", "#14b8a6", "#f97316",
];

interface InsightsChartsProps {
  leads: Lead[];
}

export function InsightsCharts({ leads }: InsightsChartsProps) {
  const categoryData = useMemo(() => {
    const map = new Map<string, { total: number; won: number }>();
    leads.forEach((lead) => {
      const cat = lead.categoria || "Sem Categoria";
      const prev = map.get(cat) || { total: 0, won: 0 };
      prev.total++;
      if (lead.status === LEAD_STATUS.FECHADO_GANHO || lead.status === "Fechado") {
        prev.won++;
      }
      map.set(cat, prev);
    });

    return Array.from(map.entries())
      .map(([name, { total, won }]) => ({
        name,
        total,
        won,
        rate: total > 0 ? ((won / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [leads]);

  const cityData = useMemo(() => {
    const map = new Map<string, number>();
    leads.forEach((lead) => {
      const city = lead.cidade || "Sem Cidade";
      map.set(city, (map.get(city) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [leads]);

  const statusDistribution = useMemo(() => {
    const map = new Map<string, number>();
    leads.forEach((lead) => {
      const s = lead.status || "Desconhecido";
      map.set(s, (map.get(s) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Categories with conversion */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Categorias por Volume</CardTitle>
          <CardDescription>Top segmentos e taxa de fechamento</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryData}
                layout="vertical"
                margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted)/0.3)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                        <p className="font-medium">{d.name}</p>
                        <p className="text-muted-foreground">
                          {d.total} leads · {d.won} fechados · {d.rate.toFixed(1)}% conversão
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="total" name="Total" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={18} opacity={0.3} />
                <Bar dataKey="won" name="Fechados" fill="#10b981" radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Inline legend */}
          <div className="flex justify-center gap-6 mt-2">
            {[
              { label: "Total de Leads", color: "#3b82f6" },
              { label: "Fechados Ganho", color: "#10b981" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Status donut */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Status dos Leads</CardTitle>
          <CardDescription>Distribuição atual</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                >
                  {statusDistribution.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    const total = leads.length;
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                        <p className="font-medium">{d.name}</p>
                        <p className="text-muted-foreground">
                          {d.value} ({total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%)
                        </p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Status legend */}
          <div className="space-y-1.5 mt-2">
            {statusDistribution.slice(0, 6).map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                  />
                  <span className="text-muted-foreground truncate max-w-[120px]">{item.name}</span>
                </div>
                <span className="font-medium tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
