/**
 * Sistema de Roles e Permissões (RBAC)
 *
 * Tipos de roles:
 * - admin: Acesso total ao sistema, pode gerenciar usuários e roles
 * - operador: Pode criar, editar e deletar leads próprios
 * - visualizador: Apenas leitura, sem permissões de escrita
 */

export type UserRole = 'admin' | 'operador' | 'visualizador';

export interface RolePermissions {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canBulkDelete: boolean;
  canExport: boolean;
  canSendWhatsApp: boolean;
  canManageRoles: boolean;
  canViewAuditLogs: boolean;
  canManageIntegrations: boolean;
}

/**
 * Definição de permissões por role
 */
export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    canBulkDelete: true,
    canExport: true,
    canSendWhatsApp: true,
    canManageRoles: true,
    canViewAuditLogs: true,
    canManageIntegrations: true,
  },
  operador: {
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    canBulkDelete: false, // Apenas admin pode fazer bulk delete
    canExport: true,
    canSendWhatsApp: true,
    canManageRoles: false,
    canViewAuditLogs: false,
    canManageIntegrations: false,
  },
  visualizador: {
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canBulkDelete: false,
    canExport: true, // Pode exportar mas não modificar
    canSendWhatsApp: false,
    canManageRoles: false,
    canViewAuditLogs: false,
    canManageIntegrations: false,
  },
};

/**
 * Labels em português para os roles
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  visualizador: 'Visualizador',
};

/**
 * Descrições dos roles
 */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Acesso total ao sistema, incluindo gerenciamento de usuários e configurações',
  operador: 'Pode criar, editar e deletar leads. Não pode fazer alterações em massa',
  visualizador: 'Apenas visualização e exportação de dados. Sem permissões de escrita',
};

/**
 * Ícones para cada role (usando Lucide icons)
 */
export const ROLE_ICONS: Record<UserRole, string> = {
  admin: 'shield-check',
  operador: 'user-cog',
  visualizador: 'eye',
};

/**
 * Cores para badges de roles
 */
export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-500',
  operador: 'bg-blue-500',
  visualizador: 'bg-gray-500',
};
