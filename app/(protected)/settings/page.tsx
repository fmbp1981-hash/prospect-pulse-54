'use client';

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Save, Building2, MessageSquare, Eye, EyeOff, Settings as SettingsIcon, Trash2, AlertTriangle, History, Clock, RefreshCw } from "lucide-react";
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
  
  // Configurações de Follow-up automático
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [followUpDays, setFollowUpDays] = useState(7);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const settings = await userSettingsService.getUserSettings();
      if (settings) {
        setCompanyName(settings.company_name || "");
        setEvolutionApiUrl(settings.evolution_api_url || "");
        setEvolutionApiKey(settings.evolution_api_key || "");
        setEvolutionInstanceName(settings.evolution_instance_name || "");
      }
      
      // Carregar configurações de Follow-up
      if (user?.id) {
        const followUpConfig = leadAutomation.loadFollowUpConfig(user.id);
        setFollowUpEnabled(followUpConfig.enabled);
        setFollowUpDays(followUpConfig.daysToFollowUp);
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
      toast.error("Erro ao carregar configurações");
    } finally {
      setIsLoading(false);
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
        evolution_api_url: evolutionApiUrl,
        evolution_api_key: evolutionApiKey,
        evolution_instance_name: evolutionInstanceName,
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

      {/* Integrações WhatsApp - Apenas para Admins */}
      <RoleGuard allowedRoles={['admin']}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <CardTitle>Evolution API - WhatsApp</CardTitle>
            </div>
            <CardDescription>
              Configure a instância da Evolution API para verificação e envio de mensagens WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="evolution_instance_name">
                Nome da Instância
              </Label>
              <Input
                id="evolution_instance_name"
                placeholder="Ex: WA-Pessoal, WA-Producao"
                value={evolutionInstanceName}
                onChange={(e) => setEvolutionInstanceName(e.target.value)}
                className="max-w-md"
              />
              <p className="text-xs text-muted-foreground">
                Nome identificador da instância no Evolution API
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="evolution_api_url">
                URL da API
              </Label>
              <Input
                id="evolution_api_url"
                placeholder="Ex: https://evolution.intellixai.com.br/chat/whatsappNumbers/WA-Pessoal"
                value={evolutionApiUrl}
                onChange={(e) => setEvolutionApiUrl(e.target.value)}
                className="max-w-2xl"
              />
              <p className="text-xs text-muted-foreground">
                URL completa do endpoint da Evolution API incluindo a instância
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="evolution_api_key">
                API Key
              </Label>
              <div className="relative max-w-2xl">
                <Input
                  id="evolution_api_key"
                  type={showApiKey ? "text" : "password"}
                  placeholder="Sua chave de API da Evolution"
                  value={evolutionApiKey}
                  onChange={(e) => setEvolutionApiKey(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Chave de autenticação da Evolution API
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                💡 Configuração por Usuário:
              </p>
              <div className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                <p>1. Configure a instância Evolution para este usuário</p>
                <p>2. O webhook URL único será gerado automaticamente</p>
                <p>3. As configurações são exclusivas de cada usuário</p>
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                ⚠️ Importante:
              </p>
              <div className="text-xs text-yellow-800 dark:text-yellow-200">
                <p>Estas configurações são gerenciadas pelo administrador do sistema.</p>
              </div>
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
