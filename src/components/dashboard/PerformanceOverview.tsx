import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lead } from "@/types/prospection";
import { LEAD_STATUS } from "@/lib/constants";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format, parseISO, startOfWeek, eachWeekOfInterval, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo } from "react";

interface PerformanceOverviewProps {
  leads: Lead[];
}

export function PerformanceOverview({ leads }: PerformanceOverviewProps) {
  // Build weekly timeline of pipeline progression over the last 12 weeks
  const weeklyData = useMemo(() => {
    const now = new Date();
    const twelveWeeksAgo = subDays(now, 84);
    const weeks = eachWeekOfInterval(
      { start: twelveWeeksAgo, end: now },
      { weekStartsOn: 1 }
    );

    return weeks.map((weekStart) => {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Count leads created in this week
      const weekLeads = leads.filter((lead) => {
        const created = lead.createdAt || lead.data;
        if (!created) return false;
        try {
          const d = new Date(created);
          return d >= weekStart && d <= weekEnd;
        } catch {
          return false;
        }
      });

      const prospected = weekLeads.length;
      const contacted = weekLeads.filter((l) =>
        l.status !== LEAD_STATUS.NOVO_LEAD && l.status !== "Novo"
      ).length;
      const qualified = weekLeads.filter((l) =>
        [LEAD_STATUS.QUALIFICACAO, LEAD_STATUS.TRANSFERIDO_PARA_CONSULTOR, LEAD_STATUS.FECHADO_GANHO, LEAD_STATUS.FECHADO_PERDIDO, "Proposta Enviada", "Negociação"].includes(l.status)
      ).length;
      const won = weekLeads.filter((l) =>
        l.status === LEAD_STATUS.FECHADO_GANHO || l.status === "Fechado"
      ).length;

      return {
        week: format(weekStart, "dd/MM", { locale: ptBR }),
        prospected,
        contacted,
        qualified,
        won,
      };
    });
  }, [leads]);

  // Compute totals for the summary badges
  const totals = useMemo(() => {
    const last4 = weeklyData.slice(-4);
    const prev4 = weeklyData.slice(-8, -4);

    const sumRecent = last4.reduce((acc, w) => acc + w.prospected, 0);
    const sumPrev = prev4.reduce((acc, w) => acc + w.prospected, 0);
    const wonRecent = last4.reduce((acc, w) => acc + w.won, 0);
    const wonPrev = prev4.reduce((acc, w) => acc + w.won, 0);

    return {
      recentProspected: sumRecent,
      prevProspected: sumPrev,
      prospTrend: sumPrev > 0 ? ((sumRecent - sumPrev) / sumPrev) * 100 : 0,
      recentWon: wonRecent,
      prevWon: wonPrev,
      wonTrend: wonPrev > 0 ? ((wonRecent - wonPrev) / wonPrev) * 100 : 0,
    };
  }, [weeklyData]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold">Performance Semanal</CardTitle>
            <CardDescription>Progressão do funil nas últimas 12 semanas</CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge
              variant="outline"
              className={`text-xs tabular-nums ${totals.prospTrend >= 0 ? "text-emerald-600 border-emerald-300" : "text-red-600 border-red-300"}`}
            >
              Prospecção {totals.prospTrend >= 0 ? "+" : ""}{totals.prospTrend.toFixed(0)}%
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs tabular-nums ${totals.wonTrend >= 0 ? "text-emerald-600 border-emerald-300" : "text-red-600 border-red-300"}`}
            >
              Fechamentos {totals.wonTrend >= 0 ? "+" : ""}{totals.wonTrend.toFixed(0)}%
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gradProsp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradQual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradWon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
                      <p className="font-medium mb-1">Semana {label}</p>
                      {payload.map((p: any) => (
                        <p key={p.dataKey} style={{ color: p.color }}>
                          {p.name}: {p.value}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="prospected"
                name="Prospectados"
                stroke="#3b82f6"
                fill="url(#gradProsp)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="qualified"
                name="Qualificados"
                stroke="#f59e0b"
                fill="url(#gradQual)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="won"
                name="Fechados"
                stroke="#10b981"
                fill="url(#gradWon)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-3">
          {[
            { label: "Prospectados", color: "#3b82f6" },
            { label: "Qualificados", color: "#f59e0b" },
            { label: "Fechados", color: "#10b981" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
