import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Link2,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Save,
  RefreshCw,
  Webhook,
  Activity,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { getAuditLogs } from "@/lib/audit";
import { useUserRole } from "@/hooks/useUserRole";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Integrations() {
  const { isAdmin, isLoading: isLoadingRole } = useUserRole();
  const [webhookUrl, setWebhookUrl] = useState("");

  type AuditLogRow = {
    id: string;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    details?: Record<string, unknown> | null;
    created_at: string;
    user_id?: string | null;
  };

  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const loadAuditLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const logs = await getAuditLogs(50);
      setAuditLogs(logs as AuditLogRow[]);
    } catch (error) {
      console.error("Erro ao carregar logs:", error);
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    // Carregar webhook URL do localStorage
    const savedWebhook = localStorage.getItem("whatsapp_webhook_url");
    if (savedWebhook) {
      setWebhookUrl(savedWebhook);
    }

    // Carregar logs de auditoria
    loadAuditLogs();
  }, [loadAuditLogs]);

  const handleSaveWebhook = () => {
    try {
      localStorage.setItem("whatsapp_webhook_url", webhookUrl);
      toast.success("Webhook salvo com sucesso!");
    } catch (error) {
      toast.error("Erro ao salvar webhook");
    }
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada para área de transferência");
  };

  const getStatusBadge = (action: string) => {
    const statusMap: Record<string, { color: string; icon: LucideIcon }> = {
      EXPORT_LEADS: { color: "bg-blue-500", icon: CheckCircle2 },
      WHATSAPP_DISPATCH: { color: "bg-green-500", icon: CheckCircle2 },
      START_PROSPECTION: { color: "bg-purple-500", icon: CheckCircle2 },
      BULK_DELETE_LEADS: { color: "bg-red-500", icon: XCircle },
    };

    const status = statusMap[action] || { color: "bg-gray-500", icon: Activity };
    const Icon = status.icon;

    return (
      <Badge className={`${status.color} text-white gap-1`}>
        <Icon className="h-3 w-3" />
        {action.replace(/_/g, " ")}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Verificar permissão de admin
  if (isLoadingRole) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[60vh]">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Acesso Negado</AlertTitle>
          <AlertDescription>
            Apenas administradores podem acessar a página de Integrações.
            Entre em contato com um administrador se precisar configurar webhooks ou visualizar logs de auditoria.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          <Link2 className="h-10 w-10 text-primary" />
          Integrações
        </h1>
        <p className="text-xl text-muted-foreground">
          Configure webhooks e visualize logs de integração
        </p>
      </div>

      <Tabs defaultValue="webhooks" className="animate-fade-in">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="webhooks" className="gap-2">
            <Webhook className="h-4 w-4" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Activity className="h-4 w-4" />
            Logs de Auditoria
          </TabsTrigger>
        </TabsList>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="space-y-6">
          {/* WhatsApp Webhook */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold">Webhook WhatsApp (n8n)</h2>
                <Badge variant="outline">Evolution API</Badge>
              </div>

              <p className="text-muted-foreground">
                Configure o endpoint do n8n que recebe os disparos de WhatsApp.
                Este webhook deve processar os leads e enviar as mensagens via Evolution API.
              </p>

              <div className="space-y-2">
                <Label htmlFor="webhook-url">URL do Webhook</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhook-url"
                    placeholder="https://n8n.seudominio.com/webhook/whatsapp"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyWebhook}
                    disabled={!webhookUrl}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSaveWebhook}>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Configuração
                </Button>
              </div>

              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">ℹ️ Informações Importantes</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>O webhook deve aceitar POST requests com JSON payload</li>
                  <li>Payload contém: leadId, whatsapp, message, leadName, empresa</li>
                  <li>Resposta esperada: {'{ success: true }'} ou {'{ success: false, error: "..." }'}</li>
                  <li>Configuração armazenada localmente (localStorage)</li>
                </ul>
              </div>
            </div>
          </Card>

          {/* Supabase Info (Read-only) */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold">Supabase</h2>
                <Badge className="bg-green-500 text-white gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Conectado
                </Badge>
              </div>

              <p className="text-muted-foreground">
                Banco de dados e autenticação gerenciados pelo Supabase.
                Configuração via variáveis de ambiente (somente leitura).
              </p>

              <div className="space-y-2">
                <Label>Project URL</Label>
                <Input
                  value={import.meta.env.VITE_SUPABASE_URL || "Não configurado"}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm">Conectado e operacional</span>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold">Logs de Auditoria</h2>
                <p className="text-muted-foreground">
                  Histórico de todas as ações críticas realizadas
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadAuditLogs}
                disabled={isLoadingLogs}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingLogs ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>

            {isLoadingLogs ? (
              <div className="text-center py-8 text-muted-foreground">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                Carregando logs...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum log de auditoria encontrado</p>
                <p className="text-sm mt-1">Os logs aparecerão aqui após ações no sistema</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatDate(log.created_at)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(log.action)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.entity_type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                          {log.details && Object.keys(log.details).length > 0
                            ? JSON.stringify(log.details).substring(0, 100) + "..."
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
