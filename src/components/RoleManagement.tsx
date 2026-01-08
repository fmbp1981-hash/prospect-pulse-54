import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, ShieldCheck, UserCog, Eye, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserRole, ROLE_LABELS, ROLE_COLORS, ROLE_DESCRIPTIONS } from "@/types/roles";

interface UserWithSettings {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

/**
 * Componente de gerenciamento de roles (apenas para admins)
 * Permite visualizar e alterar roles de outros usuários
 */
export function RoleManagement() {
  const [users, setUsers] = useState<UserWithSettings[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      // Buscar user_settings e juntar com audit_logs para pegar o email
      // Como não temos acesso direto aos emails de outros usuários,
      // vamos mostrar apenas o user_id e role por enquanto
      const { data: userSettings, error } = await supabase
        .from('user_settings')
        .select('user_id, role, created_at' as any); // Cast any para evitar erro de tipo inexistente

      if (error) throw error;

      // Buscar o usuário atual para mostrar seu email
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      const usersData: UserWithSettings[] = (userSettings || []).map((setting: any) => ({
        id: setting.user_id,
        email: setting.user_id === currentUser?.id ? (currentUser.email || 'Você') : setting.user_id.substring(0, 8) + '...',
        role: (setting.role as UserRole) || 'operador',
        created_at: setting.created_at || new Date().toISOString(),
      }));

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
      const { error } = await supabase
        .from('user_settings')
        .update({ role: newRole } as any)
        .eq('user_id', userId);

      if (error) throw error;

      toast.success(`Role alterado para ${ROLE_LABELS[newRole]} com sucesso`);
      loadUsers(); // Recarregar lista
    } catch (error) {
      console.error('Erro ao atualizar role:', error);
      toast.error('Erro ao atualizar role. Apenas administradores podem fazer essa ação.');
    } finally {
      setUpdatingUserId(null);
    }
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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Gerenciamento de Roles
          </CardTitle>
          <CardDescription>
            Gerencie permissões de usuários do sistema
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Gerenciamento de Roles
        </CardTitle>
        <CardDescription>
          Gerencie permissões de usuários do sistema. Alterações são registradas no log de auditoria.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Legenda de Roles */}
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

        {/* Tabela de Usuários */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role Atual</TableHead>
                <TableHead>Cadastrado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhum usuário encontrado
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>
                      <Badge className={`${ROLE_COLORS[user.role]} text-white gap-1`}>
                        {getRoleIcon(user.role)}
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Select
                        value={user.role}
                        onValueChange={(value) => handleRoleChange(user.id, value as UserRole)}
                        disabled={updatingUserId === user.id}
                      >
                        <SelectTrigger className="w-[180px] ml-auto">
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
          <strong>💡 Importante:</strong> Apenas administradores podem gerenciar roles. Todas as alterações são registradas no log de auditoria e podem ser visualizadas na página de Integrações.
        </div>
      </CardContent>
    </Card>
  );
}
