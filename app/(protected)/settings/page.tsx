'use client';

import { useState, useEffect, useRef } from "react";
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
import { Loader2, Save, Building2, MessageSquare, Eye, EyeOff, Settings as SettingsIcon, Trash2, AlertTriangle, History, Clock, RefreshCw, Bot, RotateCcw, BookOpen, FileText, Upload, Phone, UserCheck } from "lucide-react";
import { userSettingsService } from "@/lib/userSettings";
import { RoleGuard } from "@/components/RoleGuard";
import { RoleManagement } from "@/components/RoleManagement";
import { supabaseCRM, syncAllLeads } from "@/lib/supabaseCRM";
import { historyService } from "@/lib/history";
import { leadAutomation, type FollowUpConfig } from "@/lib/leadAutomation";
import { useAuth } from "@/contexts/AuthContext";

export default function SettingsPage() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingLeads, setIsDeletingLeads] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [isProcessingFollowUp, setIsProcessingFollowUp] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [evolutionApiUrl, setEvolutionApiUrl] = useState("");
  const [evolutionApiKey, setEvolutionApiKey] = useState("");
  const [evolutionInstanceName, setEvolutionInstanceName] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showMetaToken, setShowMetaToken] = useState(false);

  // Provider WhatsApp
  const [whatsappProvider, setWhatsappProvider] = useState<'evolution' | 'meta'>('evolution');
  // Meta Cloud API
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaVerifyToken, setMetaVerifyToken] = useState("");

  // Consultor para transferências
  const [consultantWhatsapp, setConsultantWhatsapp] = useState("");

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
        setWhatsappProvider((settings.provider as 'evolution' | 'meta') || 'evolution');
        setEvolutionApiUrl(settings.evolution_api_url || "");
        setEvolutionApiKey(settings.evolution_api_key || "");
        setEvolutionInstanceName(settings.evolution_instance_name || "");
        setMetaPhoneNumberId(settings.business_phone_number_id || "");
        setMetaAccessToken(settings.business_access_token || "");
        setMetaVerifyToken(settings.meta_verify_token || "");
        setConsultantWhatsapp(settings.consultant_whatsapp || "");
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
    if (!companyName.trim()) {
      toast.error("Por favor, preencha o nome da sua empresa");
      return;
    }

    setIsSaving(true);
    try {
      await userSettingsService.saveUserSettings({
        company_name: companyName,
        provider: whatsappProvider,
        evolution_api_url: evolutionApiUrl,
        evolution_api_key: evolutionApiKey,
        evolution_instance_name: evolutionInstanceName,
        business_phone_number_id: metaPhoneNumberId,
        business_access_token: metaAccessToken,
        meta_verify_token: metaVerifyToken,
        consultant_whatsapp: consultantWhatsapp,
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
              disabled={isSaving || !companyName.trim()}
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
              <p>• Requer <code className="bg-muted px-1 rounded">OPENAI_API_KEY</code> configurada no Vercel</p>
            </div>
          </CardContent>
        </Card>
      </RoleGuard>

      {/* Integrações WhatsApp - Apenas para Admins */}
      <RoleGuard allowedRoles={['admin']}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <CardTitle>Integração WhatsApp</CardTitle>
            </div>
            <CardDescription>
              Escolha o provedor e configure as credenciais para envio e recebimento de mensagens
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Selector de Provider */}
            <div className="space-y-2">
              <Label>Provedor WhatsApp</Label>
              <Select value={whatsappProvider} onValueChange={(v) => setWhatsappProvider(v as 'evolution' | 'meta')}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="evolution">Evolution API (não oficial)</SelectItem>
                  <SelectItem value="meta">Meta Cloud API (oficial)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── EVOLUTION API ── */}
            {whatsappProvider === 'evolution' && (
              <div className="space-y-4 border rounded-lg p-4">
                <p className="text-sm font-medium">Configurações Evolution API</p>

                <div className="space-y-2">
                  <Label htmlFor="evolution_instance_name">Nome da Instância</Label>
                  <Input
                    id="evolution_instance_name"
                    placeholder="Ex: WA-Pessoal, WA-Producao"
                    value={evolutionInstanceName}
                    onChange={(e) => setEvolutionInstanceName(e.target.value)}
                    className="max-w-md"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="evolution_api_url">URL da API</Label>
                  <Input
                    id="evolution_api_url"
                    placeholder="https://evolution.seudominio.com.br"
                    value={evolutionApiUrl}
                    onChange={(e) => setEvolutionApiUrl(e.target.value)}
                    className="max-w-2xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="evolution_api_key">API Key</Label>
                  <div className="relative max-w-2xl">
                    <Input
                      id="evolution_api_key"
                      type={showApiKey ? "text" : "password"}
                      placeholder="Sua chave de API da Evolution"
                      value={evolutionApiKey}
                      onChange={(e) => setEvolutionApiKey(e.target.value)}
                      className="pr-10"
                    />
                    <Button type="button" variant="ghost" size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowApiKey(!showApiKey)}>
                      {showApiKey ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── META CLOUD API (OFICIAL) ── */}
            {whatsappProvider === 'meta' && (
              <div className="space-y-4 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Configurações Meta Cloud API (Oficial)</p>
                  <Badge className="bg-blue-500 text-white text-xs">Oficial Meta</Badge>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-200 space-y-1">
                  <p className="font-medium">Como obter as credenciais:</p>
                  <p>1. Acesse <strong>developers.facebook.com</strong> → seu App → WhatsApp → Configuração da API</p>
                  <p>2. Copie o <strong>ID do número de telefone</strong> e o <strong>Token de acesso</strong></p>
                  <p>3. Defina um Verify Token de sua escolha e configure no webhook da Meta</p>
                  <p>4. URL do webhook: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">/api/webhooks/evolution</code></p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta_phone_id">Phone Number ID</Label>
                  <Input
                    id="meta_phone_id"
                    placeholder="Ex: 123456789012345"
                    value={metaPhoneNumberId}
                    onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                    className="max-w-md font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Encontrado em: Meta App → WhatsApp → Configuração da API → ID do número de telefone
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta_access_token">Token de Acesso (System User Token)</Label>
                  <div className="relative max-w-2xl">
                    <Input
                      id="meta_access_token"
                      type={showMetaToken ? "text" : "password"}
                      placeholder="EAA..."
                      value={metaAccessToken}
                      onChange={(e) => setMetaAccessToken(e.target.value)}
                      className="pr-10 font-mono"
                    />
                    <Button type="button" variant="ghost" size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowMetaToken(!showMetaToken)}>
                      {showMetaToken ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use um System User Token permanente (não o token temporário de 24h)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta_verify_token">Verify Token (Webhook)</Label>
                  <Input
                    id="meta_verify_token"
                    placeholder="Ex: meu_token_secreto_123"
                    value={metaVerifyToken}
                    onChange={(e) => setMetaVerifyToken(e.target.value)}
                    className="max-w-md font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Token definido por você. Configure o mesmo valor no painel de webhook da Meta.
                  </p>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200">
                  <p className="font-medium mb-1">Variáveis de ambiente necessárias na Vercel:</p>
                  <code className="block bg-amber-100 dark:bg-amber-900 p-2 rounded space-y-1">
                    <span className="block">WHATSAPP_PROVIDER=meta</span>
                    <span className="block">META_WA_TOKEN={"<Token de Acesso>"}</span>
                    <span className="block">META_WA_PHONE_NUMBER_ID={"<Phone Number ID>"}</span>
                    <span className="block">META_WA_VERIFY_TOKEN={"<Verify Token>"}</span>
                  </code>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={isSaving || !companyName.trim()}>
                {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" />Salvar Configurações</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      </RoleGuard>

      {/* Agente de Atendimento e Consultor - Apenas para Admins */}
      <RoleGuard allowedRoles={['admin']}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <CardTitle>Agente de Atendimento</CardTitle>
            </div>
            <CardDescription>
              Configure os números de WhatsApp do bot e do consultor responsável pelos leads transferidos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* WhatsApp do Agente (leitura) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                WhatsApp do Agente (instância de atendimento)
              </Label>
              <div className="flex items-center gap-2 max-w-md">
                <Input
                  value={evolutionInstanceName || "Não configurado"}
                  disabled
                  className="bg-muted font-mono text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Instância Evolution conectada ao número que o bot usa para conversar com leads.
                Configure em <strong>Integração WhatsApp</strong> acima.
              </p>
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
              <Button onClick={handleSave} disabled={isSaving || !companyName.trim()}>
                {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" />Salvar Configurações</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      </RoleGuard>

      {/* Mensagem para usuários não-admin */}
      <RoleGuard allowedRoles={['operador', 'visualizador']}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <CardTitle>Integração WhatsApp</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                As configurações de integração com WhatsApp são gerenciadas pelo administrador do sistema.
                Entre em contato com o suporte caso precise de ajustes.
              </p>
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

      {/* Role Management - Apenas para Admins */}
      <RoleGuard allowedRoles={['admin']}>
        <RoleManagement />
      </RoleGuard>
    </div>
  );
}
