import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, ShieldCheck, UserCog, Eye, Shield, Settings, AlertCircle, CheckCircle, Copy, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserRole, ROLE_LABELS, ROLE_COLORS, ROLE_DESCRIPTIONS } from "@/types/roles";

interface UserWithSettings {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  company_name: string | null;
  pending_setup: boolean;
  integration_configured: boolean;
  user_webhook_url: string | null;
  evolution_api_url: string | null;
  evolution_api_key: string | null;
  evolution_instance_name: string | null;
  whatsapp_webhook_url: string | null;
}

interface IntegrationFormData {
  evolution_api_url: string;
  evolution_api_key: string;
  evolution_instance_name: string;
  whatsapp_webhook_url: string;
}

/**
 * Componente de gerenciamento de roles e integrações (apenas para admins)
 * Permite visualizar e alterar roles de outros usuários
 * Permite configurar integrações de WhatsApp para cada usuário
 */
export function RoleManagement() {
  const [users, setUsers] = useState<UserWithSettings[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserWithSettings | null>(null);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<IntegrationFormData>({
    evolution_api_url: "",
    evolution_api_key: "",
    evolution_instance_name: "",
    whatsapp_webhook_url: "",
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const { data: userSettings, error } = await supabase
        .from('user_settings')
        .select('user_id, role, created_at, company_name, pending_setup, integration_configured, user_webhook_url, evolution_api_url, evolution_api_key, evolution_instance_name, whatsapp_webhook_url');

      if (error) throw error;

      const { data: { user: currentUser } } = await supabase.auth.getUser();

      const usersData: UserWithSettings[] = (userSettings || []).map((setting: any) => ({
        id: setting.user_id,
        email: setting.user_id === currentUser?.id ? (currentUser.email || 'Você') : setting.user_id.substring(0, 8) + '...',
        role: (setting.role as UserRole) || 'operador',
        created_at: setting.created_at || new Date().toISOString(),
        company_name: setting.company_name,
        pending_setup: setting.pending_setup ?? true,
        integration_configured: setting.integration_configured ?? false,
        user_webhook_url: setting.user_webhook_url,
        evolution_api_url: setting.evolution_api_url,
        evolution_api_key: setting.evolution_api_key,
        evolution_instance_name: setting.evolution_instance_name,
        whatsapp_webhook_url: setting.whatsapp_webhook_url,
      }));

      // Ordenar: pendentes primeiro, depois por data
      usersData.sort((a, b) => {
        if (a.pending_setup && !b.pending_setup) return -1;
        if (!a.pending_setup && b.pending_setup) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setUsers(usersData);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      toast.error('Erro ao carregar usuários. Verifique suas permissões.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setUpdatingUserId(userId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('user_settings')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) throw error;

      toast.success(`Role alterado para ${ROLE_LABELS[newRole]} com sucesso`);
      loadUsers();
    } catch (error) {
      console.error('Erro ao atualizar role:', error);
      toast.error('Erro ao atualizar role. Apenas administradores podem fazer essa ação.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const openConfigDialog = (user: UserWithSettings) => {
    setSelectedUser(user);
    setFormData({
      evolution_api_url: user.evolution_api_url || "",
      evolution_api_key: user.evolution_api_key || "",
      evolution_instance_name: user.evolution_instance_name || "",
      whatsapp_webhook_url: user.whatsapp_webhook_url || "",
    });
    setIsConfigDialogOpen(true);
  };

  const handleSaveIntegration = async () => {
    if (!selectedUser) return;

    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('user_settings')
        .update({
          evolution_api_url: formData.evolution_api_url || null,
          evolution_api_key: formData.evolution_api_key || null,
          evolution_instance_name: formData.evolution_instance_name || null,
          whatsapp_webhook_url: formData.whatsapp_webhook_url || null,
          integration_configured: true,
          pending_setup: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', selectedUser.id);

      if (error) throw error;

      toast.success('Integração configurada com sucesso!');
      setIsConfigDialogOpen(false);
      loadUsers();
    } catch (error) {
      console.error('Erro ao salvar integração:', error);
      toast.error('Erro ao salvar configurações de integração.');
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência!');
  };

  const getRoleIcon = (role: UserRole) => {
    const icons = {
      admin: ShieldCheck,
      operador: UserCog,
      visualizador: Eye,
    };
    const Icon = icons[role];
    return <Icon className="h-4 w-4" />;
  };

  const getStatusBadge = (user: UserWithSettings) => {
    if (user.pending_setup) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Pendente
        </Badge>
      );
    }
    if (user.integration_configured) {
      return (
        <Badge variant="default" className="gap-1 bg-green-600">
          <CheckCircle className="h-3 w-3" />
          Configurado
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1">
        Não configurado
      </Badge>
    );
  };

  const pendingUsers = users.filter(u => u.pending_setup);
  const configuredUsers = users.filter(u => !u.pending_setup);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Gerenciamento de Usuários
          </CardTitle>
          <CardDescription>
            Gerencie permissões e integrações de usuários do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Gerenciamento de Usuários
          </CardTitle>
          <CardDescription>
            Gerencie permissões e configure integrações WhatsApp para cada usuário.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Alerta de usuários pendentes */}
          {pendingUsers.length > 0 && (
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 p-4 border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                <AlertCircle className="h-5 w-5" />
                <span className="font-semibold">
                  {pendingUsers.length} usuário(s) aguardando configuração
                </span>
              </div>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Configure as integrações de WhatsApp para que os novos usuários possam utilizar o sistema.
              </p>
            </div>
          )}

          <Tabs defaultValue={pendingUsers.length > 0 ? "pending" : "all"}>
            <TabsList>
              <TabsTrigger value="pending" className="gap-2">
                Pendentes
                {pendingUsers.length > 0 && (
                  <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {pendingUsers.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all">Todos os Usuários</TabsTrigger>
              <TabsTrigger value="roles">Roles</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4">
              {pendingUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>Todos os usuários estão configurados!</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Webhook URL</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.email}</TableCell>
                          <TableCell>{user.company_name || '-'}</TableCell>
                          <TableCell>
                            {user.user_webhook_url ? (
                              <div className="flex items-center gap-1">
                                <code className="text-xs bg-muted px-1 py-0.5 rounded max-w-[150px] truncate">
                                  {user.user_webhook_url}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => copyToClipboard(user.user_webhook_url!)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">Não gerado</span>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(user)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => openConfigDialog(user)}
                              className="gap-1"
                            >
                              <Settings className="h-4 w-4" />
                              Configurar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="all" className="mt-4">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cadastrado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhum usuário encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.email}</TableCell>
                          <TableCell>{user.company_name || '-'}</TableCell>
                          <TableCell>
                            <Badge className={`${ROLE_COLORS[user.role]} text-white gap-1`}>
                              {getRoleIcon(user.role)}
                              {ROLE_LABELS[user.role]}
                            </Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(user)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(user.created_at).toLocaleDateString('pt-BR')}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openConfigDialog(user)}
                                className="gap-1"
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                              <Select
                                value={user.role}
                                onValueChange={(value) => handleRoleChange(user.id, value as UserRole)}
                                disabled={updatingUserId === user.id}
                              >
                                <SelectTrigger className="w-[140px]">
                                  <SelectValue placeholder="Alterar role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">
                                    <div className="flex items-center gap-2">
                                      <ShieldCheck className="h-4 w-4" />
                                      Administrador
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="operador">
                                    <div className="flex items-center gap-2">
                                      <UserCog className="h-4 w-4" />
                                      Operador
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="visualizador">
                                    <div className="flex items-center gap-2">
                                      <Eye className="h-4 w-4" />
                                      Visualizador
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="roles" className="mt-4">
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <h4 className="font-semibold text-sm">Tipos de Roles:</h4>
                <div className="grid gap-2">
                  {Object.entries(ROLE_DESCRIPTIONS).map(([role, description]) => (
                    <div key={role} className="flex items-start gap-2">
                      <Badge className={`${ROLE_COLORS[role as UserRole]} text-white`}>
                        {getRoleIcon(role as UserRole)}
                        <span className="ml-1">{ROLE_LABELS[role as UserRole]}</span>
                      </Badge>
                      <p className="text-xs text-muted-foreground flex-1">{description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
            <strong>Importante:</strong> Apenas administradores podem gerenciar roles e configurar integrações. Configure a URL do webhook e credenciais da Evolution API para cada usuário que precisa enviar mensagens via WhatsApp.
          </div>
        </CardContent>
      </Card>

      {/* Dialog de Configuração de Integração */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurar Integração - {selectedUser?.company_name || selectedUser?.email}
            </DialogTitle>
            <DialogDescription>
              Configure as credenciais da Evolution API e webhook URL para este usuário.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Webhook URL do Usuário (somente leitura) */}
            {selectedUser?.user_webhook_url && (
              <div className="space-y-2">
                <Label>Webhook URL do Usuário (n8n)</Label>
                <div className="flex gap-2">
                  <Input
                    value={selectedUser.user_webhook_url}
                    readOnly
                    className="bg-muted font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(selectedUser.user_webhook_url!)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use esta URL no n8n para identificar o usuário. Configure no node de webhook do workflow.
                </p>
              </div>
            )}

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Evolution API</h4>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="evolution_api_url">URL da API</Label>
                  <Input
                    id="evolution_api_url"
                    placeholder="https://evolution.example.com"
                    value={formData.evolution_api_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, evolution_api_url: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="evolution_api_key">API Key</Label>
                  <Input
                    id="evolution_api_key"
                    type="password"
                    placeholder="Sua API Key"
                    value={formData.evolution_api_key}
                    onChange={(e) => setFormData(prev => ({ ...prev, evolution_api_key: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="evolution_instance_name">Nome da Instância</Label>
                  <Input
                    id="evolution_instance_name"
                    placeholder="nome-da-instancia"
                    value={formData.evolution_instance_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, evolution_instance_name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whatsapp_webhook_url">Webhook URL do WhatsApp (n8n)</Label>
                  <Input
                    id="whatsapp_webhook_url"
                    placeholder="https://n8n.example.com/webhook/..."
                    value={formData.whatsapp_webhook_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, whatsapp_webhook_url: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    URL do webhook n8n para enviar mensagens via WhatsApp
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveIntegration} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Configuração'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
