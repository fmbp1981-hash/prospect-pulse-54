import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  TrendingUp,
  TrendingDown,
  Users,
  MessageCircle,
  UserCheck,
  Handshake,
  XCircle,
  Clock,
  ArrowDown,
  Percent,
} from "lucide-react";
import { Lead } from "@/types/prospection";
import { LEAD_STATUS } from "@/lib/constants";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts";

// ============= TYPES =============

interface PipelineMetrics {
  novoLead: number;
  contatoInicial: number;
  qualificacao: number;
  transferido: number;
  fechadoGanho: number;
  fechadoPerdido: number;
  followUp: number;
}

interface ConversionRates {
  prospToContact: number;      // Novo Lead → Contato Inicial
  contactToQualified: number;  // Contato Inicial → Qualificação
  qualifiedToTransfer: number; // Qualificação → Transferido
  transferToWon: number;       // Transferido → Fechado Ganho
  overallConversion: number;   // Novo Lead → Fechado Ganho
  lossRate: number;            // Taxa de perda
}

interface ConversionMetricsProps {
  leads: Lead[];
}

// ============= HELPERS =============

function computePipelineMetrics(leads: Lead[]): PipelineMetrics {
  const counts: PipelineMetrics = {
    novoLead: 0,
    contatoInicial: 0,
    qualificacao: 0,
    transferido: 0,
    fechadoGanho: 0,
    fechadoPerdido: 0,
    followUp: 0,
  };

  leads.forEach((lead) => {
    const s = lead.status;
    switch (s) {
      case LEAD_STATUS.NOVO_LEAD:
      case "Novo":
        counts.novoLead++;
        break;
      case LEAD_STATUS.CONTATO_INICIAL:
        counts.contatoInicial++;
        break;
      case LEAD_STATUS.QUALIFICACAO:
      case "Proposta Enviada":
        counts.qualificacao++;
        break;
      case LEAD_STATUS.TRANSFERIDO_PARA_CONSULTOR:
      case "Negociação":
        counts.transferido++;
        break;
      case LEAD_STATUS.FECHADO_GANHO:
      case "Fechado":
        counts.fechadoGanho++;
        break;
      case LEAD_STATUS.FECHADO_PERDIDO:
        counts.fechadoPerdido++;
        break;
      case LEAD_STATUS.FOLLOWUP:
      case "Em Follow-up":
        counts.followUp++;
        break;
    }
  });

  return counts;
}

function computeConversionRates(pm: PipelineMetrics, total: number): ConversionRates {
  // "Advanced" leads = those that progressed past this stage
  const reachedContact = pm.contatoInicial + pm.qualificacao + pm.transferido + pm.fechadoGanho + pm.fechadoPerdido;
  const reachedQualification = pm.qualificacao + pm.transferido + pm.fechadoGanho + pm.fechadoPerdido;
  const reachedTransfer = pm.transferido + pm.fechadoGanho + pm.fechadoPerdido;
  const closed = pm.fechadoGanho + pm.fechadoPerdido;

  return {
    prospToContact: total > 0 ? (reachedContact / total) * 100 : 0,
    contactToQualified: reachedContact > 0 ? (reachedQualification / reachedContact) * 100 : 0,
    qualifiedToTransfer: reachedQualification > 0 ? (reachedTransfer / reachedQualification) * 100 : 0,
    transferToWon: reachedTransfer > 0 ? (pm.fechadoGanho / reachedTransfer) * 100 : 0,
    overallConversion: total > 0 ? (pm.fechadoGanho / total) * 100 : 0,
    lossRate: closed > 0 ? (pm.fechadoPerdido / closed) * 100 : 0,
  };
}

// ============= KPI CARD =============

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}

function KPICard({ title, value, subtitle, icon: Icon, color, bgColor, borderColor }: KPICardProps) {
  return (
    <Card className={`${bgColor} ${borderColor} transition-all hover:shadow-md`}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={`p-2 rounded-lg ${bgColor}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============= PIPELINE FUNNEL BAR =============

interface PipelineFunnelBarProps {
  pipeline: PipelineMetrics;
  total: number;
}

const PIPELINE_STAGES = [
  { key: "novoLead" as const, label: "Novo Lead", color: "#3b82f6", icon: Users },
  { key: "contatoInicial" as const, label: "Contato Inicial", color: "#8b5cf6", icon: MessageCircle },
  { key: "qualificacao" as const, label: "Qualificação", color: "#f59e0b", icon: Target },
  { key: "transferido" as const, label: "Transferido", color: "#06b6d4", icon: UserCheck },
  { key: "fechadoGanho" as const, label: "Fechado Ganho", color: "#10b981", icon: Handshake },
  { key: "fechadoPerdido" as const, label: "Fechado Perdido", color: "#ef4444", icon: XCircle },
  { key: "followUp" as const, label: "Follow-up", color: "#64748b", icon: Clock },
];

function PipelineFunnelBar({ pipeline, total }: PipelineFunnelBarProps) {
  const data = PIPELINE_STAGES.map((stage) => ({
    name: stage.label,
    value: pipeline[stage.key],
    color: stage.color,
    pct: total > 0 ? ((pipeline[stage.key] / total) * 100).toFixed(1) : "0",
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Pipeline de Leads</CardTitle>
        <CardDescription>Distribuição por estágio do funil de vendas</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
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
                        {d.value} leads ({d.pct}%)
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  style={{ fontSize: 12, fill: "hsl(var(--foreground))", fontWeight: 600 }}
                  formatter={(v: number) => (v > 0 ? v : "")}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ============= CONVERSION RATES CARD =============

interface ConversionRatesCardProps {
  rates: ConversionRates;
}

function ConversionRatesCard({ rates }: ConversionRatesCardProps) {
  const steps = [
    {
      from: "Novo Lead",
      to: "Contato Inicial",
      rate: rates.prospToContact,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
    {
      from: "Contato Inicial",
      to: "Qualificação",
      rate: rates.contactToQualified,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      from: "Qualificação",
      to: "Transferido",
      rate: rates.qualifiedToTransfer,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
    {
      from: "Transferido",
      to: "Fechado Ganho",
      rate: rates.transferToWon,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Taxas de Conversão</CardTitle>
        <CardDescription>Eficiência de cada etapa do funil</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{step.from}</span>
                <ArrowDown className="h-3 w-3 text-muted-foreground/50 rotate-[-90deg]" />
                <span className="font-medium">{step.to}</span>
              </div>
              <Badge variant="outline" className={`${step.color} font-semibold tabular-nums`}>
                {step.rate.toFixed(1)}%
              </Badge>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${step.bg.replace("/10", "")}`}
                style={{
                  width: `${Math.min(step.rate, 100)}%`,
                  backgroundColor: `hsl(var(--${step.color.replace("text-", "").split("-")[0]}))`,
                }}
              />
            </div>
            {/* Use inline style for the bar color since Tailwind purge won't catch dynamic classes */}
            <style>{`
              .conv-bar-${i} { background: ${
                step.color === "text-violet-500" ? "#8b5cf6" :
                step.color === "text-amber-500" ? "#f59e0b" :
                step.color === "text-cyan-500" ? "#06b6d4" : "#10b981"
              }; }
            `}</style>
            <div
              className={`h-2 rounded-full transition-all duration-700 conv-bar-${i}`}
              style={{
                width: `${Math.min(step.rate, 100)}%`,
                marginTop: "-8px",
              }}
            />
          </div>
        ))}

        {/* Overall conversion highlight */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold">Conversão Geral</span>
              <span className="text-xs text-muted-foreground">(Prospecção → Fechamento)</span>
            </div>
            <span className="text-lg font-bold text-emerald-500 tabular-nums">
              {rates.overallConversion.toFixed(1)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============= MAIN COMPONENT =============

export function ConversionMetrics({ leads }: ConversionMetricsProps) {
  const total = leads.length;
  const pipeline = computePipelineMetrics(leads);
  const rates = computeConversionRates(pipeline, total);

  const withWhatsApp = leads.filter((l) => l.whatsapp?.trim()).length;
  const whatsappRate = total > 0 ? ((withWhatsApp / total) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* ---- ROW 1: KPI Cards ---- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          title="Prospectados"
          value={total.toLocaleString()}
          subtitle={`${pipeline.novoLead} aguardando`}
          icon={Users}
          color="text-blue-600 dark:text-blue-400"
          bgColor="bg-blue-500/5"
          borderColor="border-blue-500/20"
        />
        <KPICard
          title="Em Contato"
          value={pipeline.contatoInicial.toLocaleString()}
          subtitle={`${whatsappRate}% com WhatsApp`}
          icon={MessageCircle}
          color="text-violet-600 dark:text-violet-400"
          bgColor="bg-violet-500/5"
          borderColor="border-violet-500/20"
        />
        <KPICard
          title="Qualificados"
          value={pipeline.qualificacao.toLocaleString()}
          subtitle={`${rates.contactToQualified.toFixed(0)}% de conversão`}
          icon={Target}
          color="text-amber-600 dark:text-amber-400"
          bgColor="bg-amber-500/5"
          borderColor="border-amber-500/20"
        />
        <KPICard
          title="Transferidos"
          value={pipeline.transferido.toLocaleString()}
          subtitle="Para consultor"
          icon={UserCheck}
          color="text-cyan-600 dark:text-cyan-400"
          bgColor="bg-cyan-500/5"
          borderColor="border-cyan-500/20"
        />
        <KPICard
          title="Fechados"
          value={pipeline.fechadoGanho.toLocaleString()}
          subtitle={`${rates.overallConversion.toFixed(1)}% do total`}
          icon={Handshake}
          color="text-emerald-600 dark:text-emerald-400"
          bgColor="bg-emerald-500/5"
          borderColor="border-emerald-500/20"
        />
        <KPICard
          title="Perdidos"
          value={pipeline.fechadoPerdido.toLocaleString()}
          subtitle={`${rates.lossRate.toFixed(0)}% taxa de perda`}
          icon={XCircle}
          color="text-red-600 dark:text-red-400"
          bgColor="bg-red-500/5"
          borderColor="border-red-500/20"
        />
      </div>

      {/* ---- ROW 2: Pipeline + Conversion Rates ---- */}
      <div className="grid lg:grid-cols-2 gap-6">
        <PipelineFunnelBar pipeline={pipeline} total={total} />
        <ConversionRatesCard rates={rates} />
      </div>
    </div>
  );
}
