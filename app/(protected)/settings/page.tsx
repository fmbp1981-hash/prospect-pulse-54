'use client';

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save, Building2, Settings as SettingsIcon, Trash2, AlertTriangle, History, Clock, RefreshCw, Bot, RotateCcw, BookOpen, FileText, Upload, Phone, UserCheck, Plug, ShieldCheck } from "lucide-react";
import { userSettingsService } from "@/lib/userSettings";
import { supabase } from "@/integrations/supabase/client";
import { RoleGuard } from "@/components/RoleGuard";
import { RoleManagement } from "@/components/RoleManagement";
import { supabaseCRM, syncAllLeads } from "@/lib/supabaseCRM";
import { historyService } from "@/lib/history";
import { leadAutomation, type FollowUpConfig } from "@/lib/leadAutomation";
import { useAuth } from "@/contexts/AuthContext";
import { WebhookKeysPanel } from '@/components/settings/WebhookKeysPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectionStatusList } from '@/components/connections/ConnectionStatusList';
import { NotConfiguredNotice } from '@/components/connections/NotConfiguredNotice';
import { OrganizationConnections, useAdminOrganizations } from '@/components/admin/OrganizationConnections';
import { PlatformCredentials } from '@/components/admin/PlatformCredentials';
import { useUserRole } from '@/hooks/useUserRole';
import { ImportHistoryPanel } from '@/components/settings/ImportHistoryPanel';
import { IcpSettingsPanel } from '@/components/settings/IcpSettingsPanel';

function IntegrationsTabScroller() {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('tab') === 'integrations') {
      setTimeout(() => {
        document.getElementById('import-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [searchParams]);
  return null;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  // Abas do admin da PLATAFORMA: só aparecem se a API de admin responder (403 para os demais).
  const platformAdmin = useAdminOrganizations(isAdmin);
  const isPlatformAdmin = platformAdmin.isSuccess;
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingLeads, setIsDeletingLeads] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [isProcessingFollowUp, setIsProcessingFollowUp] = useState(false);
  const [companyName, setCompanyName] = useState("");
  // Consultor para transferências
  const [consultantWhatsapp, setConsultantWhatsapp] = useState("");

  // Toggle do agente de IA
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [isSavingAgentToggle, setIsSavingAgentToggle] = useState(false);

  // Configurações de Follow-up automático
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [followUpDays, setFollowUpDays] = useState(7);

  // Configurações do Agente de IA
  const [agentConfigId, setAgentConfigId] = useState<string | null>(null);
  const [agentSystemPrompt, setAgentSystemPrompt] = useState("");
  const [agentModel, setAgentModel] = useState("gpt-4.1");
  const [agentTemperature, setAgentTemperature] = useState(0.7);
  const [agentMaxIterations, setAgentMaxIterations] = useState(5);
  const [isSavingAgent, setIsSavingAgent] = useState(false);
  const [isResettingAgent, setIsResettingAgent] = useState(false);
  const [agentPromptVersion, setAgentPromptVersion] = useState("default");

  // RAG - Base de Conhecimento
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ragDocuments, setRagDocuments] = useState<any[]>([]);
  const [isLoadingRag, setIsLoadingRag] = useState(false);
  const [ragUploadMode, setRagUploadMode] = useState<'file' | 'text'>('file');
  const [ragTextContent, setRagTextContent] = useState('');
  const [ragTextFilename, setRagTextFilename] = useState('');
  const [isUploadingRag, setIsUploadingRag] = useState(false);
  const ragFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadRagDocuments = async () => {
    setIsLoadingRag(true);
    try {
      const res = await fetch('/api/agent/rag');
      if (res.ok) {
        const { documents } = await res.json();
        setRagDocuments(documents ?? []);
      }
    } catch {
      // tabela ainda não criada — silencioso
    } finally {
      setIsLoadingRag(false);
    }
  };

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const settings = await userSettingsService.getUserSettings();
      if (settings) {
        setCompanyName(settings.company_name || "");
        setConsultantWhatsapp(settings.consultant_whatsapp || "");
        setAgentEnabled(settings.agent_enabled !== false);
      }

      // Carregar configurações de Follow-up
      if (user?.id) {
        const followUpConfig = leadAutomation.loadFollowUpConfig(user.id);
        setFollowUpEnabled(followUpConfig.enabled);
        setFollowUpDays(followUpConfig.daysToFollowUp);
      }

      // Carregar configuração do Agente de IA
      try {
        const res = await fetch("/api/agent/config");
        if (res.ok) {
          const { configs } = await res.json();
          if (configs && configs.length > 0) {
            const active = configs.find((c: any) => c.isActive) || configs[0];
            setAgentConfigId(active.id);
            setAgentSystemPrompt(active.systemPrompt || "");
            setAgentModel(active.model || "gpt-4.1");
            setAgentTemperature(active.temperature ?? 0.7);
            setAgentMaxIterations(active.maxIterations ?? 5);
            setAgentPromptVersion(active.promptVersion || "default");
          }
        }
      } catch {
        // Tabela ainda não criada no Supabase — silencioso
      }

      // Carregar documentos RAG
      await loadRagDocuments();
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
      toast.error("Erro ao carregar configurações");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAgent = async (enabled: boolean) => {
    setAgentEnabled(enabled);
    setIsSavingAgentToggle(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('Não autenticado');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('user_settings')
        .update({ agent_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('user_id', currentUser.id);
      if (error) throw error;
      toast.success(enabled ? 'Agente ativado' : 'Agente pausado', {
        description: enabled
          ? 'O agente voltará a responder os leads automaticamente.'
          : 'Mensagens chegam mas não são respondidas automaticamente.',
      });
    } catch {
      setAgentEnabled(!enabled); // reverter em caso de erro
      toast.error('Erro ao salvar configuração do agente');
    } finally {
      setIsSavingAgentToggle(false);
    }
  };

  const handleSaveAgentConfig = async () => {
    if (!agentSystemPrompt.trim()) {
      toast.error("O System Prompt não pode estar vazio");
      return;
    }
    setIsSavingAgent(true);
    try {
      const res = await fetch("/api/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Configuração personalizada",
          systemPrompt: agentSystemPrompt,
          model: agentModel,
          temperature: agentTemperature,
          maxIterations: agentMaxIterations,
          activate: true,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { config } = await res.json();
      setAgentConfigId(config.id);
      setAgentPromptVersion(config.promptVersion || "custom");
      toast.success("Configuração do Agente salva!", {
        description: "O novo prompt entrará em vigor imediatamente.",
      });
    } catch (error) {
      console.error("Erro ao salvar configuração do agente:", error);
      toast.error("Erro ao salvar configuração do Agente");
    } finally {
      setIsSavingAgent(false);
    }
  };

  const handleResetAgentConfig = async () => {
    setIsResettingAgent(true);
    try {
      const res = await fetch("/api/agent/config", { method: "PUT" });
      if (!res.ok) throw new Error(await res.text());
      const { config } = await res.json();
      setAgentSystemPrompt(config.systemPrompt || "");
      setAgentModel(config.model || "gpt-4.1");
      setAgentTemperature(config.temperature ?? 0.7);
      setAgentMaxIterations(config.maxIterations ?? 5);
      setAgentPromptVersion(config.promptVersion || "default");
      toast.success("Prompt resetado para o padrão do sistema v3.5");
    } catch (error) {
      console.error("Erro ao resetar configuração:", error);
      toast.error("Erro ao resetar configuração do Agente");
    } finally {
      setIsResettingAgent(false);
    }
  };

  const handleRagUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingRag(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/agent/rag', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const { chunksCreated } = await res.json();
      toast.success(`Documento "${file.name}" adicionado!`, {
        description: `${chunksCreated} chunks indexados`,
      });
      await loadRagDocuments();
    } catch {
      toast.error('Erro ao fazer upload do documento');
    } finally {
      setIsUploadingRag(false);
      if (ragFileRef.current) ragFileRef.current.value = '';
    }
  };

  const handleRagUploadText = async () => {
    if (!ragTextContent.trim()) {
      toast.error('O conteúdo não pode estar vazio');
      return;
    }
    setIsUploadingRag(true);
    try {
      const res = await fetch('/api/agent/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: ragTextFilename.trim() || 'documento.txt',
          content: ragTextContent,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { chunksCreated } = await res.json();
      toast.success('Documento adicionado!', { description: `${chunksCreated} chunks indexados` });
      setRagTextContent('');
      setRagTextFilename('');
      await loadRagDocuments();
    } catch {
      toast.error('Erro ao adicionar documento');
    } finally {
      setIsUploadingRag(false);
    }
  };

  const handleRagDelete = async (id: string, filename: string) => {
    if (!window.confirm(`Remover "${filename}" da base de conhecimento?`)) return;
    try {
      const res = await fetch(`/api/agent/rag?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Documento removido');
      await loadRagDocuments();
    } catch {
      toast.error('Erro ao remover documento');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await userSettingsService.saveUserSettings({
        company_name: companyName,
        consultant_whatsapp: consultantWhatsapp,
        agent_enabled: agentEnabled,
      });

      // Salvar configurações de Follow-up
      if (user?.id) {
        const followUpConfig: FollowUpConfig = {
          enabled: followUpEnabled,
          daysToFollowUp: followUpDays,
          stages: ['Contato Inicial', 'Proposta Enviada', 'Negociação'],
        };
        await leadAutomation.saveFollowUpConfig(user.id, followUpConfig);
      }

      toast.success("Configurações salvas com sucesso!", {
        description: "Suas configurações foram atualizadas",
      });
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setIsSaving(false);
    }
  };

  const handleProcessFollowUp = async () => {
    setIsProcessingFollowUp(true);
    try {
      const config: FollowUpConfig = {
        enabled: followUpEnabled,
        daysToFollowUp: followUpDays,
        stages: ['Contato Inicial', 'Proposta Enviada', 'Negociação'],
      };
      const result = await leadAutomation.processInactiveLeads(config);
      
      if (result.moved > 0) {
        toast.success(`${result.moved} leads movidos para Follow-up`, {
          description: `${result.processed} leads verificados, ${result.errors} erros`,
        });
      } else {
        toast.info("Nenhum lead inativo encontrado", {
          description: `${result.processed} leads verificados`,
        });
      }
    } catch (error) {
      console.error("Erro ao processar leads inativos:", error);
      toast.error("Erro ao processar leads inativos");
    } finally {
      setIsProcessingFollowUp(false);
    }
  };

  const handleDeleteAllLeads = async () => {
    const confirmed = window.confirm(
      "⚠️ ATENÇÃO: Esta ação irá APAGAR PERMANENTEMENTE todos os leads da base de dados.\n\nEsta ação NÃO pode ser desfeita!\n\nDeseja continuar?"
    );

    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      "Tem CERTEZA ABSOLUTA? Digite 'CONFIRMAR' mentalmente e clique OK para prosseguir."
    );

    if (!doubleConfirm) return;

    setIsDeletingLeads(true);
    try {
      // Buscar todos os leads
      const { leads } = await syncAllLeads();

      if (leads.length === 0) {
        toast.info("Não há leads para excluir");
        return;
      }

      // Excluir todos os leads
      const leadIds = leads.map(l => l.id);
      const result = await supabaseCRM.deleteLeads(leadIds);

      if (result.success) {
        toast.success(`${leads.length} leads excluídos com sucesso!`);
      } else {
        toast.error(result.message || "Erro ao excluir leads");
      }
    } catch (error) {
      console.error("Erro ao excluir leads:", error);
      toast.error("Erro ao excluir leads");
    } finally {
      setIsDeletingLeads(false);
    }
  };

  const handleClearHistory = async () => {
    const confirmed = window.confirm(
      "⚠️ ATENÇÃO: Esta ação irá limpar todo o histórico de pesquisas.\n\nEsta ação NÃO pode ser desfeita!\n\nDeseja continuar?"
    );

    if (!confirmed) return;

    setIsClearingHistory(true);
    try {
      await historyService.clearHistory();
      toast.success("Histórico de pesquisas limpo com sucesso!");
    } catch (error) {
      console.error("Erro ao limpar histórico:", error);
      toast.error("Erro ao limpar histórico");
    } finally {
      setIsClearingHistory(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-8">
      <Suspense fallback={null}>
        <IntegrationsTabScroller />
      </Suspense>
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <SettingsIcon className="h-8 w-8 text-primary" />
          Configurações
        </h1>
        <p className="text-muted-foreground mt-2">
          Configure as informações da sua empresa para personalizar os templates
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>Informações da Empresa</CardTitle>
          </div>
          <CardDescription>
            Essas informações serão usadas para substituir as variáveis nos templates de mensagens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="company_name">
              Nome da Sua Empresa <span className="text-red-500">*</span>
            </Label>
            <Input
              id="company_name"
              placeholder="Ex: IntelliX Solutions"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="max-w-md"
            />
            <p className="text-xs text-muted-foreground">
              Esse nome será usado na variável <code className="bg-muted px-1 rounded">{"{{minha_empresa}}"}</code> nos templates
            </p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">
              💡 Como usar nos templates:
            </p>
            <div className="space-y-1 text-xs text-yellow-800 dark:text-yellow-200">
              <p>• <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{minha_empresa}}"}</code> = {companyName || "Sua empresa"}</p>
              <p>• <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{empresa}}"}</code> = Nome da empresa prospectada</p>
              <p>• <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{categoria}}"}</code> = Categoria do lead</p>
              <p>• <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{cidade}}"}</code> = Cidade do lead</p>
              <p>• <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{contato}}"}</code> = Nome do contato (se disponível)</p>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
              📝 Exemplo de mensagem:
            </p>
            <div className="text-xs text-blue-800 dark:text-blue-200 bg-white dark:bg-blue-950 p-3 rounded border border-blue-200 dark:border-blue-800">
              <p className="whitespace-pre-wrap">
                Olá! Sou da <strong>{companyName || "Sua Empresa"}</strong>.<br /><br />
                Notei que a <strong>{"{{empresa}}"}</strong> em <strong>{"{{cidade}}"}</strong> atua no ramo de <strong>{"{{categoria}}"}</strong>.<br /><br />
                Podemos ajudar a impulsionar seus resultados. Posso apresentar nossa solução?
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="min-w-32"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Configurações
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configurações de Follow-up Automático */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle>Follow-up Automático</CardTitle>
          </div>
          <CardDescription>
            Configure a automação para mover leads inativos para Follow-up
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between max-w-md">
            <div className="space-y-0.5">
              <Label htmlFor="followup_enabled">Ativar Follow-up Automático</Label>
              <p className="text-xs text-muted-foreground">
                Leads inativos serão movidos automaticamente para Follow-up
              </p>
            </div>
            <Switch
              id="followup_enabled"
              checked={followUpEnabled}
              onCheckedChange={setFollowUpEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="followup_days">
              Dias de Inatividade para Follow-up
            </Label>
            <div className="flex items-center gap-2 max-w-md">
              <Input
                id="followup_days"
                type="number"
                min={1}
                max={90}
                value={followUpDays}
                onChange={(e) => setFollowUpDays(parseInt(e.target.value) || 7)}
                disabled={!followUpEnabled}
                className="max-w-24"
              />
              <span className="text-sm text-muted-foreground">dias sem interação</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Leads nos estágios &quot;Contato Inicial&quot;, &quot;Proposta Enviada&quot; e &quot;Negociação&quot; 
              serão movidos para Follow-up após este período de inatividade
            </p>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-2">
              ⚠️ Como funciona:
            </p>
            <div className="space-y-1 text-xs text-amber-800 dark:text-amber-200">
              <p>• Leads são verificados ao executar o processo manualmente ou por automação</p>
              <p>• O motivo &quot;Inatividade prolongada&quot; é registrado automaticamente</p>
              <p>• Leads em Follow-up podem ser reativados manualmente a qualquer momento</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              variant="outline"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Configurações
                </>
              )}
            </Button>
            <Button
              onClick={handleProcessFollowUp}
              disabled={isProcessingFollowUp || !followUpEnabled}
            >
              {isProcessingFollowUp ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Processar Leads Inativos Agora
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Agente de IA - Admin e Operador */}
      <RoleGuard requiredPermission="canManageAgent">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <CardTitle>Agente de IA</CardTitle>
              {agentPromptVersion && (
                <Badge variant="outline" className="text-xs">
                  v{agentPromptVersion}
                </Badge>
              )}
            </div>
            <CardDescription>
              Configure o System Prompt, modelo e comportamento do agente de atendimento WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <NotConfiguredNotice category="llm" />

            <div className="space-y-2">
              <Label htmlFor="agent_model">Modelo de IA</Label>
              <Select value={agentModel} onValueChange={setAgentModel}>
                <SelectTrigger className="max-w-xs" id="agent_model">
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4.1">GPT-4.1 (Recomendado)</SelectItem>
                  <SelectItem value="gpt-4.1-mini">GPT-4.1 Mini (Rápido)</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="agent_temperature">
                  Temperatura: <span className="font-mono font-bold">{agentTemperature.toFixed(2)}</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  {agentTemperature < 0.4 ? "Conservador" : agentTemperature < 0.8 ? "Equilibrado" : "Criativo"}
                </span>
              </div>
              <Slider
                id="agent_temperature"
                min={0}
                max={2}
                step={0.05}
                value={[agentTemperature]}
                onValueChange={([v]) => setAgentTemperature(v)}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Valores mais baixos = respostas mais focadas. Valores mais altos = mais criatividade.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent_max_iterations">
                Máximo de Iterações: <span className="font-mono font-bold">{agentMaxIterations}</span>
              </Label>
              <Slider
                id="agent_max_iterations"
                min={1}
                max={10}
                step={1}
                value={[agentMaxIterations]}
                onValueChange={([v]) => setAgentMaxIterations(v)}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Quantidade máxima de chamadas de ferramentas por resposta do agente.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent_system_prompt">System Prompt</Label>
              <Textarea
                id="agent_system_prompt"
                placeholder="Digite o system prompt do agente..."
                value={agentSystemPrompt}
                onChange={(e) => setAgentSystemPrompt(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {agentSystemPrompt.length} caracteres · Define a personalidade, regras e comportamento do agente no WhatsApp
              </p>
            </div>

            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={handleSaveAgentConfig}
                disabled={isSavingAgent || !agentSystemPrompt.trim()}
              >
                {isSavingAgent ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" />Salvar Configuração</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleResetAgentConfig}
                disabled={isResettingAgent}
              >
                {isResettingAgent ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetando...</>
                ) : (
                  <><RotateCcw className="h-4 w-4 mr-2" />Restaurar Padrão (v3.4)</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </RoleGuard>

      {/* Base de Conhecimento RAG - Admin e Operador */}
      <RoleGuard requiredPermission="canManageAgent">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <CardTitle>Base de Conhecimento (RAG)</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {ragDocuments.length} doc{ragDocuments.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <CardDescription>
              Adicione documentos para treinar o agente com conhecimento específico da sua empresa.
              O agente buscará automaticamente informações relevantes ao responder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Lista de documentos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Documentos indexados</Label>
                <Button variant="ghost" size="sm" onClick={loadRagDocuments} disabled={isLoadingRag}>
                  <RefreshCw className={`h-4 w-4 ${isLoadingRag ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              {isLoadingRag ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando documentos...
                </div>
              ) : ragDocuments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Nenhum documento na base de conhecimento.
                </p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {ragDocuments.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between p-2 border rounded-lg text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{doc.filename}</span>
                        <Badge
                          variant={doc.status === 'ready' ? 'default' : 'secondary'}
                          className="text-xs shrink-0"
                        >
                          {doc.status === 'ready' ? 'Pronto' : doc.status === 'processing' ? 'Processando' : doc.status === 'error' ? 'Erro' : doc.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {doc.chunk_count || 0} chunks
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => handleRagDelete(doc.id, doc.filename)}
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upload */}
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={ragUploadMode === 'file' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRagUploadMode('file')}
                >
                  Upload Arquivo
                </Button>
                <Button
                  variant={ragUploadMode === 'text' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRagUploadMode('text')}
                >
                  Colar Texto
                </Button>
              </div>

              {ragUploadMode === 'file' ? (
                <div className="space-y-2">
                  <Label htmlFor="rag_file">Arquivo (.txt, .md, .pdf, .json · máx 10 MB)</Label>
                  <Input
                    id="rag_file"
                    type="file"
                    ref={ragFileRef}
                    accept=".txt,.md,.pdf,.json"
                    onChange={handleRagUploadFile}
                    disabled={isUploadingRag}
                    className="max-w-md"
                  />
                  {isUploadingRag && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processando e indexando...
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="rag_text_filename">Nome do documento</Label>
                    <Input
                      id="rag_text_filename"
                      placeholder="Ex: politicas-empresa.txt"
                      value={ragTextFilename}
                      onChange={(e) => setRagTextFilename(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rag_text_content">Conteúdo</Label>
                    <Textarea
                      id="rag_text_content"
                      placeholder="Cole aqui o texto do documento..."
                      value={ragTextContent}
                      onChange={(e) => setRagTextContent(e.target.value)}
                      className="min-h-[120px] text-sm"
                    />
                  </div>
                  <Button
                    onClick={handleRagUploadText}
                    disabled={isUploadingRag || !ragTextContent.trim()}
                  >
                    {isUploadingRag ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando...</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" />Adicionar Documento</>
                    )}
                  </Button>
                </div>
              )}
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Como o RAG funciona:</p>
              <p>• Documentos são fragmentados em chunks e indexados com embeddings vetoriais (OpenAI)</p>
              <p>• O agente busca automaticamente conhecimento relevante ao responder cada mensagem</p>
              <p>• Requer a integração de <strong>IA</strong> ativa para a organização (configurada pela equipe IntelliX)</p>
            </div>
          </CardContent>
        </Card>
      </RoleGuard>

      {/* Integrações da organização — status somente leitura (configuradas pela equipe IntelliX) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            <CardTitle>Integrações</CardTitle>
          </div>
          <CardDescription>
            WhatsApp, e-mail, IA e prospecção da sua empresa. A equipe IntelliX configura as integrações da sua empresa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionStatusList />
        </CardContent>
      </Card>

      {/* Agente de Atendimento e Consultor - Admin e Operador */}
      <RoleGuard requiredPermission="canManageAgent">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <CardTitle>Agente de Atendimento</CardTitle>
            </div>
            <CardDescription>
              Configure o número de atendimento do bot e o número do consultor que recebe os leads transferidos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Toggle — Ligar/Desligar Agente */}
            <div className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${agentEnabled ? 'border-green-500/40 bg-green-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Bot className={`h-4 w-4 ${agentEnabled ? 'text-green-600' : 'text-red-500'}`} />
                  <Label className="text-sm font-medium cursor-pointer" htmlFor="agent-toggle">
                    Agente de IA
                  </Label>
                  <Badge variant={agentEnabled ? 'default' : 'destructive'} className="text-xs">
                    {agentEnabled ? 'Ativo' : 'Pausado'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {agentEnabled
                    ? 'O agente está respondendo automaticamente todos os leads via WhatsApp.'
                    : 'Agente pausado — mensagens chegam mas não são respondidas automaticamente.'}
                </p>
              </div>
              {isSavingAgentToggle ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  id="agent-toggle"
                  checked={agentEnabled}
                  onCheckedChange={handleToggleAgent}
                />
              )}
            </div>

            {/* WhatsApp do Consultor */}
            <div className="space-y-2">
              <Label htmlFor="consultant_whatsapp" className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                WhatsApp do Consultor <span className="text-red-500">*</span>
              </Label>
              <Input
                id="consultant_whatsapp"
                placeholder="Ex: 5581999990000 (somente dígitos com DDI)"
                value={consultantWhatsapp}
                onChange={(e) => setConsultantWhatsapp(e.target.value)}
                className="max-w-md font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Número que receberá a notificação via WhatsApp quando um lead for transferido.
                Use o formato internacional sem símbolos: <code className="bg-muted px-1 rounded">5581999990000</code>
              </p>
              {consultantWhatsapp && !/^\d{10,15}$/.test(consultantWhatsapp.replace(/\D/g, '')) && (
                <p className="text-xs text-red-500">
                  Formato inválido — use apenas dígitos: DDI + DDD + número (ex: 5581999990000)
                </p>
              )}
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Como funciona a transferência:</p>
              <p>• O agente qualifica o lead e chama a tool <code className="bg-muted px-1 rounded">transferir_para_consultor</code></p>
              <p>• O sistema envia automaticamente uma mensagem ao consultor com nome, empresa e WhatsApp do lead</p>
              <p>• O lead é marcado como <strong>Transferido para Consultor</strong> no Kanban</p>
              <p>• O bot para de responder (modo humano) — o consultor assume o atendimento</p>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" />Salvar Configurações</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      </RoleGuard>

      {/* Danger Zone - Apenas para Admins */}
      <RoleGuard allowedRoles={['admin']}>
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <CardTitle className="text-red-600 dark:text-red-400">Zona de Perigo</CardTitle>
            </div>
            <CardDescription className="text-red-600/80 dark:text-red-400/80">
              Ações destrutivas que não podem ser desfeitas. Use com cuidado!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/30">
                <h4 className="font-medium text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Apagar Todos os Leads
                </h4>
                <p className="text-xs text-red-600 dark:text-red-400 mb-3">
                  Remove permanentemente todos os leads da base de dados.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAllLeads}
                  disabled={isDeletingLeads}
                  className="w-full sm:w-auto"
                >
                  {isDeletingLeads ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Excluindo...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Apagar Todos os Leads
                    </>
                  )}
                </Button>
              </div>

              <div className="flex-1 p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/30">
                <h4 className="font-medium text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Limpar Histórico de Pesquisas
                </h4>
                <p className="text-xs text-red-600 dark:text-red-400 mb-3">
                  Remove todo o histórico de pesquisas realizadas.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearHistory}
                  disabled={isClearingHistory}
                  className="w-full sm:w-auto"
                >
                  {isClearingHistory ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Limpando...
                    </>
                  ) : (
                    <>
                      <History className="h-4 w-4 mr-2" />
                      Limpar Histórico
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </RoleGuard>

      {/* Admin da PLATAFORMA: integrações por organização e credenciais da plataforma */}
      {isPlatformAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle>Administração da plataforma</CardTitle>
            </div>
            <CardDescription>
              Visível só para o admin da plataforma. Configure as integrações de cada organização e as credenciais da IntelliX.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="org-connections">
              <TabsList className="grid h-auto w-full grid-cols-1 sm:grid-cols-2">
                <TabsTrigger value="org-connections">Organizações → Integrações</TabsTrigger>
                <TabsTrigger value="platform-credentials">Credenciais da plataforma</TabsTrigger>
              </TabsList>
              <TabsContent value="org-connections" className="mt-4">
                <OrganizationConnections />
              </TabsContent>
              <TabsContent value="platform-credentials" className="mt-4">
                <PlatformCredentials />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Role Management - Apenas para Admins */}
      <RoleGuard allowedRoles={['admin']}>
        <RoleManagement />
      </RoleGuard>

      {/* Perfil de Cliente Ideal (ICP) — filtro/qualificação de prospecção */}
      <div className="mt-8 border rounded-lg p-6">
        <IcpSettingsPanel />
      </div>

      {/* Integrações - Webhook Keys */}
      <div className="mt-6 border rounded-lg p-6">
        <WebhookKeysPanel />
      </div>

      {/* Integrações - Histórico de Importações */}
      <div className="mt-6 border rounded-lg p-6">
        <ImportHistoryPanel />
      </div>
    </div>
  );
}
