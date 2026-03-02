'use client';

import { useState } from "react";
import {
  BookOpen, Settings, Zap, Search, Users, LayoutGrid, Bot,
  MessageSquare, Download, CheckCircle2, AlertCircle, Info,
  ArrowRight, Star, Phone, Globe, Brain, RefreshCw, Bell,
  Shield, Key, Rocket, ChevronRight, Play, FileText,
  BarChart3, Clock, UserCheck, Wrench
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

// ─── helpers ───────────────────────────────────────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
        {n}
      </div>
      <div className="flex-1 pb-6">
        <p className="font-semibold text-foreground mb-1">{title}</p>
        <div className="text-sm text-muted-foreground space-y-1">{children}</div>
      </div>
    </div>
  );
}

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
      <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-blue-900 dark:text-blue-100">{children}</div>
    </div>
  );
}

function WarningBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex gap-3">
      <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-yellow-900 dark:text-yellow-100">{children}</div>
    </div>
  );
}

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-lg p-4 flex gap-3">
      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-green-900 dark:text-green-100">{children}</div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="flex gap-3 p-4 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-medium text-sm">{title}</p>
          {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ─── sections ──────────────────────────────────────────────────────────────

function TabOverview() {
  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
              <Rocket className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-1">Bem-vindo ao LeadFinder Pro</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Sistema de prospecção, qualificação e gestão de leads B2B com automação via
                WhatsApp e inteligência artificial. Tudo em um único lugar.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* O que o sistema faz */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="h-5 w-5 text-primary" />
            O que o sistema entrega
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FeatureCard
            icon={Search}
            title="Prospecção Automática"
            description="Busca empresas pelo nicho e cidade via Google Places. Em menos de 30 segundos você tem dezenas de leads prontos com WhatsApp, website e endereço."
          />
          <FeatureCard
            icon={Bot}
            title="Agente de IA 24/7"
            description="O agente responde mensagens de WhatsApp automaticamente, qualifica leads pelo faturamento e transfere os qualificados ao consultor."
          />
          <FeatureCard
            icon={LayoutGrid}
            title="Pipeline Kanban"
            description="Visualize todos os leads no funil de vendas. Mova entre etapas com drag-and-drop. Atualiza em tempo real conforme o agente age."
          />
          <FeatureCard
            icon={RefreshCw}
            title="Follow-ups Automáticos"
            description="O sistema dispara follow-ups em 3 estágios para leads que não responderam, sem intervenção manual."
          />
          <FeatureCard
            icon={BarChart3}
            title="Dashboard Analítico"
            description="Métricas de conversão, top categorias, timeline de leads e taxa de sucesso em tempo real."
          />
          <FeatureCard
            icon={Download}
            title="Exportação de Dados"
            description="Exporte seus leads em CSV ou Excel com seleção de colunas. Auditoria automática de cada exportação."
          />
        </CardContent>
      </Card>

      {/* Papéis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" />
            Papéis e Permissões
          </CardTitle>
          <CardDescription>Cada usuário opera com um nível de acesso diferente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            {
              role: "Admin",
              color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
              desc: "Acesso total ao sistema. Gerencia usuários, aprova novos cadastros, configura integrações e pode alterar qualquer dado.",
            },
            {
              role: "Operador",
              color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
              desc: "Cria e edita leads, configura o agente de IA, realiza prospecções e dispara mensagens WhatsApp.",
            },
            {
              role: "Visualizador",
              color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
              desc: "Somente leitura. Acompanha métricas e pode exportar dados. Não pode criar, editar ou excluir leads.",
            },
          ].map((r) => (
            <div key={r.role} className="flex items-start gap-3 p-3 rounded-lg border">
              <span className={`text-xs font-semibold px-2 py-1 rounded-md flex-shrink-0 ${r.color}`}>
                {r.role}
              </span>
              <p className="text-sm text-muted-foreground">{r.desc}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Fluxo resumido */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Play className="h-5 w-5 text-primary" />
            Fluxo Completo do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 items-center text-sm">
            {[
              "Prospectar leads",
              "Salvar no banco",
              "Enviar WhatsApp",
              "Agente responde",
              "Lead qualificado",
              "Consultor notificado",
              "Pipeline atualizado",
            ].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-full">
                  <span className="text-xs font-medium text-primary">{i + 1}</span>
                  <span className="text-xs font-medium">{step}</span>
                </div>
                {i < arr.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TabSetup() {
  return (
    <div className="space-y-6">
      <TipBox>
        Siga os passos abaixo na ordem indicada. O sistema só funciona completamente após todas as
        integrações estarem configuradas.
      </TipBox>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-5 w-5 text-primary" />
            Configuração Inicial — Passo a Passo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <Step n={1} title="Acesse Configurações → Informações da Empresa">
            <p>Preencha o nome da sua empresa, segmento e site. Essas informações são usadas pelo agente de IA para personalizar as mensagens enviadas aos leads.</p>
            <p className="mt-1">Caminho: <code className="bg-muted px-1 rounded text-xs">Menu lateral → Configurações → aba "Empresa"</code></p>
          </Step>
          <Separator />
          <Step n={2} title="Configure a chave da OpenAI (opcional por tenant)">
            <p>Em Configurações → aba "Agente de IA", cole sua chave de API da OpenAI (<code className="bg-muted px-1 rounded text-xs">sk-...</code>). Sem ela, o agente não consegue gerar respostas inteligentes.</p>
            <p className="mt-1">Obtenha sua chave em: <span className="text-primary font-medium">platform.openai.com/api-keys</span></p>
          </Step>
          <Separator />
          <Step n={3} title="Conecte a Evolution API (WhatsApp)">
            <p>Acesse <code className="bg-muted px-1 rounded text-xs">Menu lateral → Integrações</code> e configure:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>URL da Evolution API (ex: <code className="bg-muted px-1 rounded text-xs">https://evolution.suaempresa.com</code>)</li>
              <li>Chave de API (API Key da instância)</li>
              <li>Nome da instância WhatsApp</li>
            </ul>
            <p className="mt-1">Após salvar, escaneie o QR Code para conectar o número WhatsApp.</p>
          </Step>
          <Separator />
          <Step n={4} title="Configure a chave do Google Places (prospecção)">
            <p>Em Integrações, cole sua chave da Google Places API. Ela é necessária para a prospecção automática de empresas por nicho e cidade.</p>
            <p className="mt-1">Obtenha em: <span className="text-primary font-medium">console.cloud.google.com → APIs → Places API</span></p>
          </Step>
          <Separator />
          <Step n={5} title="Configure o Prompt do Agente de IA">
            <p>Em <code className="bg-muted px-1 rounded text-xs">Configurações → aba "Agente de IA"</code>, personalize o prompt do bot com:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>Nome e identidade do agente</li>
              <li>Produto/serviço que ele representa</li>
              <li>Tom de voz (formal, amigável, etc.)</li>
              <li>Critérios de qualificação de leads</li>
            </ul>
          </Step>
          <Separator />
          <Step n={6} title="Registre o webhook na Evolution API">
            <p>Configure a URL de webhook para que a Evolution API envie as mensagens recebidas ao sistema:</p>
            <code className="block bg-muted px-3 py-2 rounded text-xs mt-1 break-all">
              https://seu-dominio.vercel.app/api/webhooks/evolution
            </code>
            <p className="mt-1">Eventos necessários: <Badge variant="outline" className="text-xs">MESSAGES_UPSERT</Badge></p>
          </Step>
        </CardContent>
      </Card>

      <SuccessBox>
        <strong>Pronto para usar!</strong> Após concluir os 6 passos, seu sistema está totalmente
        operacional. Você pode começar pela prospecção de leads.
      </SuccessBox>
    </div>
  );
}

function TabProspection() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-5 w-5 text-primary" />
            Como Prospectar Leads
          </CardTitle>
          <CardDescription>
            O sistema busca empresas automaticamente via Google Places API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: "Nicho", ex: "clínicas odontológicas, restaurantes, academias", icon: Search },
              { label: "Cidade", ex: "São Paulo, Curitiba, Fortaleza", icon: Globe },
              { label: "Quantidade", ex: "até 60 leads por busca", icon: Users },
            ].map((f) => (
              <div key={f.label} className="p-3 rounded-lg border text-center">
                <f.icon className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{f.ex}</p>
              </div>
            ))}
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-semibold">O que o sistema captura automaticamente:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                "Nome da empresa",
                "Número de WhatsApp",
                "Website",
                "Endereço completo",
                "Link Google Maps",
                "Categoria do negócio",
                "Cidade e bairro",
                "Mensagem personalizada (IA)",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-5 w-5 text-primary" />
            Histórico de Buscas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Cada busca é salva automaticamente no histórico (localStorage). Você pode reutilizar
            uma busca anterior clicando nela — o sistema reprocessa o mesmo nicho e cidade, sem
            precisar redigitar.
          </p>
          <TipBox>
            Use os <strong>Quick Selects</strong> para selecionar nichos e cidades com um clique.
            Aparecem logo abaixo dos campos de texto.
          </TipBox>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-5 w-5 text-primary" />
            Disparar WhatsApp após Prospecção
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Após salvar os leads, vá para <code className="bg-muted px-1 rounded text-xs">Tabela de Leads</code>,
            selecione os leads com WhatsApp disponível e clique em{" "}
            <strong>"Enviar WhatsApp"</strong>. Uma mensagem personalizada gerada pela IA será
            enviada para cada lead selecionado.
          </p>
          <WarningBox>
            Não dispare mais de 30–40 mensagens por hora para evitar bloqueios do WhatsApp.
            Prefira lotes menores com intervalos entre os disparos.
          </WarningBox>
        </CardContent>
      </Card>
    </div>
  );
}

function TabLeads() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-primary" />
            Tabela de Leads
          </CardTitle>
          <CardDescription>Central de gestão de todos os seus leads</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureCard
              icon={Search}
              title="Busca Full-text"
              description="Pesquise por nome da empresa, lead, WhatsApp ou qualquer campo de texto simultaneamente."
            />
            <FeatureCard
              icon={FileText}
              title="Filtros Avançados"
              description="Filtre por status, estágio do pipeline, presença de WhatsApp, data de criação e mais."
            />
            <FeatureCard
              icon={CheckCircle2}
              title="Ações em Massa"
              description="Selecione múltiplos leads com checkbox e aplique ações: exportar, enviar WhatsApp ou excluir."
            />
            <FeatureCard
              icon={Download}
              title="Exportação"
              description="Exporte para CSV ou Excel (.xlsx) com seleção personalizada de colunas e timestamp no nome do arquivo."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Kanban Pipeline
          </CardTitle>
          <CardDescription>Visualize o funil de vendas em colunas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Novo", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
              { label: "Contato Inicial", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
              { label: "Qualificação", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
              { label: "Follow-up", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
              { label: "Transferido", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
              { label: "Ganho", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
              { label: "Perdido", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
            ].map((s) => (
              <span key={s.label} className={`text-xs font-medium px-2.5 py-1 rounded-full ${s.color}`}>
                {s.label}
              </span>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Arraste e solte os cards entre as colunas para mover um lead de estágio. O Kanban
            atualiza em <strong>tempo real</strong> — quando o agente de IA qualifica um lead, o
            card se move automaticamente.
          </p>
          <TipBox>
            O lead passa para <strong>"Transferido para Consultor"</strong> automaticamente quando
            o agente detecta que o faturamento declarado está acima do critério de qualificação.
          </TipBox>
        </CardContent>
      </Card>
    </div>
  );
}

function TabAgent() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-primary" />
            Como o Agente de IA Funciona
          </CardTitle>
          <CardDescription>
            O agente responde mensagens WhatsApp automaticamente, 24 horas por dia
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Fluxo de qualificação em 5 etapas:</p>
            {[
              { stage: "Apresentação", desc: "O agente se apresenta, menciona a empresa e explica o motivo do contato." },
              { stage: "Interesse", desc: "Verifica se o lead tem interesse no produto/serviço." },
              { stage: "Qualificação", desc: "Pergunta sobre o faturamento mensal para qualificar o lead." },
              { stage: "Classificação", desc: "Classifica: Qualificado (≥ critério) ou Follow-up (abaixo do critério)." },
              { stage: "Transferência", desc: "Se qualificado, notifica o consultor via WhatsApp com os dados completos do lead." },
            ].map((e, i) => (
              <div key={e.stage} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                <div>
                  <span className="font-medium">{e.stage}:</span>{" "}
                  <span className="text-muted-foreground">{e.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-5 w-5 text-primary" />
            Modo Humano vs. Modo Bot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Modo Bot (padrão)</span>
                <Badge className="text-xs bg-green-500 hover:bg-green-500">Ativo</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                O agente de IA responde automaticamente todas as mensagens. Ideal para atendimento
                inicial e qualificação.
              </p>
            </div>
            <div className="p-3 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-semibold">Modo Humano</span>
                <Badge variant="outline" className="text-xs">Manual</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                O agente para de responder aquele lead específico. Use quando um consultor assumir
                a conversa diretamente.
              </p>
            </div>
          </div>
          <TipBox>
            Para alternar para Modo Humano em um lead, edite o lead na tabela e mude o campo
            <strong> "Modo Atendimento"</strong> de <code className="bg-muted px-1 rounded text-xs">bot</code> para{" "}
            <code className="bg-muted px-1 rounded text-xs">humano</code>.
          </TipBox>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            Suporte a Mídias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { type: "Texto", icon: MessageSquare, desc: "Resposta via GPT-4.1" },
              { type: "Áudio", icon: Play, desc: "Transcrição com Whisper" },
              { type: "Imagem", icon: Star, desc: "Análise por visão" },
              { type: "Documento", icon: FileText, desc: "Extração de texto" },
            ].map((m) => (
              <div key={m.type} className="p-3 rounded-lg border text-center">
                <m.icon className="h-5 w-5 text-primary mx-auto mb-1.5" />
                <p className="text-xs font-semibold">{m.type}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-5 w-5 text-primary" />
            Follow-ups Automáticos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Para leads que não responderam, o sistema dispara follow-ups automáticos em até 3 rodadas.
            Cada rodada usa uma mensagem diferente para aumentar a taxa de resposta.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {["Follow-up 1", "Follow-up 2", "Follow-up 3"].map((f, i) => (
              <div key={f} className="p-2 rounded-lg border text-center">
                <span className="text-xs font-semibold text-primary">{f}</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {i === 0 ? "Após 24h" : i === 1 ? "Após 48h" : "Após 72h"}
                </p>
              </div>
            ))}
          </div>
          <WarningBox>
            Follow-ups são disparados pelo cron job configurado no Vercel. Certifique-se de que a
            variável <code className="bg-muted px-1 rounded text-xs">CRON_SECRET</code> está
            configurada corretamente no painel do Vercel.
          </WarningBox>
        </CardContent>
      </Card>
    </div>
  );
}

function TabIntegrations() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-5 w-5 text-primary" />
            APIs e Integrações Necessárias
          </CardTitle>
          <CardDescription>Configure todas para o sistema funcionar completamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            {
              name: "OpenAI",
              badge: "Obrigatório",
              badgeColor: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
              desc: "Usada pelo agente de IA para gerar respostas, transcrever áudios e analisar imagens. Configure em Configurações → Agente de IA.",
              key: "sk-proj-...",
              where: "platform.openai.com/api-keys",
            },
            {
              name: "Evolution API (WhatsApp)",
              badge: "Obrigatório",
              badgeColor: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
              desc: "Gateway para enviar e receber mensagens WhatsApp. Configure em Integrações com URL + API Key + nome da instância.",
              key: "Fornecida pelo seu servidor Evolution",
              where: "evolution.suaempresa.com",
            },
            {
              name: "Google Places API",
              badge: "Para Prospecção",
              badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
              desc: "Usada para buscar empresas por nicho e cidade. Configure em Configurações → API Keys.",
              key: "AIzaSy...",
              where: "console.cloud.google.com",
            },
            {
              name: "Firecrawl (opcional)",
              badge: "Opcional",
              badgeColor: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
              desc: "Enriquece leads fazendo scraping dos websites encontrados. Gera um resumo analítico de cada empresa.",
              key: "fc-...",
              where: "firecrawl.dev",
            },
          ].map((api) => (
            <div key={api.name} className="p-4 rounded-lg border space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{api.name}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${api.badgeColor}`}>
                  {api.badge}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{api.desc}</p>
              <div className="flex gap-4 text-xs">
                <span className="text-muted-foreground">
                  Formato: <code className="bg-muted px-1 rounded">{api.key}</code>
                </span>
                <span className="text-primary font-medium">{api.where}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-5 w-5 text-primary" />
            Variáveis de Ambiente (Vercel)
          </CardTitle>
          <CardDescription>
            Necessárias para deploy em produção no Vercel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-4 font-mono text-xs space-y-1">
            {[
              ["OPENAI_API_KEY", "Chave OpenAI (obrigatório)"],
              ["SUPABASE_SERVICE_ROLE_KEY", "Chave de serviço Supabase (obrigatório)"],
              ["EVOLUTION_API_URL", "URL do servidor Evolution API"],
              ["EVOLUTION_API_KEY", "API Key da instância Evolution"],
              ["EVOLUTION_DEFAULT_INSTANCE", "Nome da instância WhatsApp"],
              ["CRON_SECRET", "Segredo para autenticar chamadas do cron"],
              ["XPAG_CONSULTANT_WHATSAPP", "Número do consultor para notificações"],
            ].map(([key, desc]) => (
              <div key={key} className="flex gap-2">
                <span className="text-primary font-medium min-w-[260px]">{key}</span>
                <span className="text-muted-foreground">{"# "}{desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── main page ─────────────────────────────────────────────────────────────

export default function TutorialPage() {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "Visão Geral", icon: BookOpen },
    { id: "setup", label: "Configuração", icon: Settings },
    { id: "prospection", label: "Prospecção", icon: Search },
    { id: "leads", label: "Leads & Kanban", icon: Users },
    { id: "agent", label: "Agente de IA", icon: Bot },
    { id: "integrations", label: "Integrações", icon: Zap },
  ];

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-primary" />
          Tutorial do Sistema
        </h1>
        <p className="text-muted-foreground mt-2">
          Guia completo de uso do LeadFinder Pro — do setup inicial às funcionalidades avançadas.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-1.5 text-xs"
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-6"><TabOverview /></TabsContent>
        <TabsContent value="setup" className="mt-6"><TabSetup /></TabsContent>
        <TabsContent value="prospection" className="mt-6"><TabProspection /></TabsContent>
        <TabsContent value="leads" className="mt-6"><TabLeads /></TabsContent>
        <TabsContent value="agent" className="mt-6"><TabAgent /></TabsContent>
        <TabsContent value="integrations" className="mt-6"><TabIntegrations /></TabsContent>
      </Tabs>

      {/* Footer nav */}
      <div className="flex justify-between items-center pt-4 border-t text-sm text-muted-foreground">
        <span>LeadFinder Pro — Documentação Interna</span>
        <div className="flex items-center gap-1">
          <span>Dúvidas?</span>
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="text-primary font-medium">suporte@intellixai.com.br</span>
        </div>
      </div>
    </div>
  );
}
