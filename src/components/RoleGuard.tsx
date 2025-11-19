import { ReactNode } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { UserRole, RolePermissions } from '@/types/roles';

interface RoleGuardProps {
  children: ReactNode;
  /** Roles permitidos (pelo menos um deve coincidir) */
  allowedRoles?: UserRole[];
  /** Permissão específica necessária */
  requiredPermission?: keyof RolePermissions;
  /** Componente a ser renderizado se não tiver permissão */
  fallback?: ReactNode;
  /** Inverter a lógica (mostrar apenas se NÃO tiver permissão) */
  inverse?: boolean;
}

/**
 * Componente para proteção condicional de UI baseado em roles/permissões
 *
 * @example
 * ```tsx
 * // Mostrar apenas para admins
 * <RoleGuard allowedRoles={['admin']}>
 *   <AdminPanel />
 * </RoleGuard>
 *
 * // Mostrar apenas se tiver permissão de deletar
 * <RoleGuard requiredPermission="canDelete">
 *   <DeleteButton />
 * </RoleGuard>
 *
 * // Mostrar para admins e operadores
 * <RoleGuard allowedRoles={['admin', 'operador']}>
 *   <EditButton />
 * </RoleGuard>
 *
 * // Mostrar fallback se não tiver permissão
 * <RoleGuard
 *   requiredPermission="canManageRoles"
 *   fallback={<p>Você não tem permissão para gerenciar roles.</p>}
 * >
 *   <RoleManager />
 * </RoleGuard>
 * ```
 */
export function RoleGuard({
  children,
  allowedRoles,
  requiredPermission,
  fallback = null,
  inverse = false,
}: RoleGuardProps) {
  const { role, hasPermission, isLoading } = useUserRole();

  // Enquanto carrega, não mostrar nada (ou pode mostrar skeleton)
  if (isLoading) {
    return null;
  }

  let hasAccess = false;

  // Verificar por roles permitidos
  if (allowedRoles && allowedRoles.length > 0) {
    hasAccess = allowedRoles.includes(role);
  }

  // Verificar por permissão específica
  if (requiredPermission) {
    hasAccess = hasPermission(requiredPermission);
  }

  // Se nenhum critério foi especificado, permitir acesso
  if (!allowedRoles && !requiredPermission) {
    hasAccess = true;
  }

  // Inverter lógica se necessário
  if (inverse) {
    hasAccess = !hasAccess;
  }

  // Renderizar children ou fallback
  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

/**
 * HOC para proteger componentes baseado em roles
 *
 * @example
 * ```tsx
 * const ProtectedComponent = withRoleGuard(MyComponent, {
 *   allowedRoles: ['admin'],
 * });
 * ```
 */
export function withRoleGuard<P extends object>(
  Component: React.ComponentType<P>,
  guardProps: Omit<RoleGuardProps, 'children'>
) {
  return function WrappedComponent(props: P) {
    return (
      <RoleGuard {...guardProps}>
        <Component {...props} />
      </RoleGuard>
    );
  };
}
