// src/lib/permissions.ts
// Centraliza RBAC para uso server-side (API routes).
// Espelho do que existe em src/hooks/useUserRole.ts mas sem React.
// Import: import { hasPermission, type Permission } from '@/lib/permissions'
// UserRole é re-exportado de @/types/roles para evitar duplicação.

export type { UserRole } from '@/types/roles'
import type { UserRole } from '@/types/roles'

export const PERMISSIONS = {
  canCreate:             ['admin', 'operador'],
  canUpdate:             ['admin', 'operador'],
  canDelete:             ['admin', 'operador'],
  canBulkDelete:         ['admin'],
  canExport:             ['admin', 'operador', 'visualizador'],
  canSendWhatsApp:       ['admin', 'operador'],
  canManageAgent:        ['admin', 'operador'],
  canManageRoles:        ['admin'],
  canViewAuditLogs:      ['admin'],
  canManageIntegrations: ['admin'],
  canManageCampaigns:    ['admin', 'operador'],
  canViewClientes:       ['admin', 'operador', 'visualizador'],
  canManageClientes:     ['admin', 'operador'],
} as const

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role)
}

export function isAdmin(role: UserRole): boolean {
  return role === 'admin'
}

export const ADMIN_EMAIL = 'fmbp1981@gmail.com'
