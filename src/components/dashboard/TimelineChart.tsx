import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { format, parseISO, startOfDay, subDays, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lead } from "@/types/prospection";

interface TimelineChartProps {
  leads: Lead[];
  days?: number;
}

export function TimelineChart({ leads, days = 30 }: TimelineChartProps) {
  // Gerar dados por dia
  const endDate = startOfDay(new Date());
  const startDate = startOfDay(subDays(endDate, days - 1));

  const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

  const data = dateRange.map((date) => {
    const dateStr = format(date, "yyyy-MM-dd");

    const leadsOnDay = leads.filter((lead) => {
      if (!lead.data) return false;
      try {
        const leadDate = format(parseISO(lead.data), "yyyy-MM-dd");
        return leadDate === dateStr;
      } catch {
        return false;
      }
    });

    const whatsappSentOnDay = leadsOnDay.filter(
      (lead) => lead.statusMsgWA === "sent" || lead.statusMsgWA === "failed"
    ).length;

    return {
      date: format(date, "dd/MM", { locale: ptBR }),
      fullDate: date,
      leads: leadsOnDay.length,
      whatsapp: whatsappSentOnDay,
    };
  });

  const totalLeads = data.reduce((sum, d) => sum + d.leads, 0);
  const totalWhatsApp = data.reduce((sum, d) => sum + d.whatsapp, 0);
  const avgLeadsPerDay = (totalLeads / days).toFixed(1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolução Temporal</CardTitle>
        <CardDescription>
          Leads prospectados e mensagens enviadas nos últimos {days} dias
          <span className="ml-2 text-sm font-medium">
            (Média: {avgLeadsPerDay} leads/dia)
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
            />
            <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="leads"
              stroke="#3b82f6"
              strokeWidth={2}
              name="Leads Prospectados"
              dot={{ fill: "#3b82f6", r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="whatsapp"
              stroke="#10b981"
              strokeWidth={2}
              name="WhatsApp Enviados"
              dot={{ fill: "#10b981", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-4 mt-4 p-4 bg-muted rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-500">{totalLeads}</div>
            <div className="text-xs text-muted-foreground">Total de Leads</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">{totalWhatsApp}</div>
            <div className="text-xs text-muted-foreground">WhatsApp Enviados</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-500">
              {totalLeads > 0 ? ((totalWhatsApp / totalLeads) * 100).toFixed(1) : 0}%
            </div>
            <div className="text-xs text-muted-foreground">Taxa de Conversão</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
