'use client';

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Link2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Webhook,
  Activity,
  ShieldAlert,
  MessageSquare,
} from "lucide-react";
import { getAuditLogs } from "@/lib/audit";
import { useUserRole } from "@/hooks/useUserRole";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { userSettingsService } from "@/lib/userSettings";

export default function IntegrationsPage() {
  const { isAdmin, isLoading: isLoadingRole } = useUserRole();
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [whatsappStatus, setWhatsappStatus] = useState<any>(null);

  useEffect(() => {
    loadAuditLogs();
    loadWhatsappStatus();
  }, []);

  const loadWhatsappStatus = async () => {
    try {
      const settings = await userSettingsService.getUserSettings();
      setWhatsappStatus(settings);
    } catch {
      // silencioso
    }
  };

  const loadAuditLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const logs = await getAuditLogs(50);
      setAuditLogs(logs);
    } catch (error) {
      console.error("Erro ao carregar logs:", error);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const getStatusBadge = (action: string) => {
    const statusMap: Record<string, { color: string; icon: any }> = {
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
          Status das integrações ativas e logs de auditoria
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

        {/* Webhooks Tab → Status das Integrações */}
        <TabsContent value="webhooks" className="space-y-6">
          {/* WhatsApp Nativo */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-semibold">WhatsApp</h2>
                {whatsappStatus?.provider === 'meta' ? (
                  <Badge className="bg-blue-500 text-white">Meta Cloud API</Badge>
                ) : (
                  <Badge className="bg-green-600 text-white">Evolution API</Badge>
                )}
                {(() => {
                  const s = whatsappStatus;
                  const configured = s?.provider === 'meta'
                    ? !!(s?.business_phone_number_id && s?.business_access_token)
                    : !!(s?.evolution_api_url && s?.evolution_api_key && s?.evolution_instance_name);
                  return configured ? (
                    <Badge className="bg-green-500 text-white gap-1">
                      <CheckCircle2 className="h-3 w-3" />Configurado
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />Não configurado
                    </Badge>
                  );
                })()}
              </div>

              <p className="text-muted-foreground text-sm">
                Envio de mensagens via API nativa — sem intermediários. Configure as credenciais em{" "}
                <strong>Configurações → Integração WhatsApp</strong>.
              </p>

              {whatsappStatus && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {whatsappStatus.provider !== 'meta' ? (
                    <>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">URL da API</p>
                        <p className="font-mono truncate">
                          {whatsappStatus.evolution_api_url || <span className="text-destructive">Não definido</span>}
                        </p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Instância</p>
                        <p className="font-mono truncate">
                          {whatsappStatus.evolution_instance_name || <span className="text-destructive">Não definido</span>}
                        </p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">API Key</p>
                        <p className="font-mono">
                          {whatsappStatus.evolution_api_key
                            ? `${'•'.repeat(8)} (configurada)`
                            : <span className="text-destructive">Não definida</span>}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Phone Number ID</p>
                        <p className="font-mono truncate">
                          {whatsappStatus.business_phone_number_id || <span className="text-destructive">Não definido</span>}
                        </p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Access Token</p>
                        <p className="font-mono">
                          {whatsappStatus.business_access_token
                            ? `${'•'.repeat(8)} (configurado)`
                            : <span className="text-destructive">Não definido</span>}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="p-4 bg-muted/50 rounded-lg text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Endpoint de envio nativo:</p>
                <code className="block bg-muted px-2 py-1 rounded">POST /api/whatsapp/send</code>
                <p className="mt-2">Webhook de recebimento (inbound):</p>
                <code className="block bg-muted px-2 py-1 rounded">POST /api/webhooks/evolution</code>
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
              <p className="text-muted-foreground text-sm">
                Banco de dados e autenticação. Configuração via variáveis de ambiente.
              </p>
              <div className="space-y-2">
                <Label>Project URL</Label>
                <Input
                  value={process.env.NEXT_PUBLIC_SUPABASE_URL || "Não configurado"}
                  disabled
                  className="bg-muted font-mono text-xs"
                />
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
