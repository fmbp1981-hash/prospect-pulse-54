import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { UserRole, ROLE_PERMISSIONS, RolePermissions } from '@/types/roles';
import { useAuth } from '@/contexts/AuthContext';

interface UseUserRoleReturn {
  role: UserRole;
  permissions: RolePermissions;
  isLoading: boolean;
  isAdmin: boolean;
  isOperador: boolean;
  isVisualizador: boolean;
  hasPermission: (permission: keyof RolePermissions) => boolean;
  refetch: () => void;
}

/**
 * Hook para gerenciar role e permissões do usuário atual
 *
 * @returns Objeto com role, permissões e helpers
 *
 * @example
 * ```tsx
 * const { role, permissions, isAdmin, hasPermission } = useUserRole();
 *
 * if (isAdmin) {
 *   // Mostrar opções de admin
 * }
 *
 * if (hasPermission('canDelete')) {
 *   // Mostrar botão de deletar
 * }
 * ```
 */
export function useUserRole(): UseUserRoleReturn {
  const { user } = useAuth();
  const [role, setRole] = useState<UserRole>('operador'); // Default

  // Buscar role do usuário no user_settings
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('user_settings')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Erro ao buscar role do usuário:', error);
        // Se não encontrar settings, criar com role padrão
        if (error.code === 'PGRST116') {
          const { data: newSettings, error: insertError } = await supabase
            .from('user_settings')
            .insert({
              user_id: user.id,
              role: 'operador',
            })
            .select('role')
            .single();

          if (insertError) {
            console.error('Erro ao criar user_settings:', insertError);
            return 'operador' as UserRole;
          }

          return newSettings.role as UserRole;
        }
        return 'operador' as UserRole;
      }

      return (data?.role || 'operador') as UserRole;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });

  // Atualizar state do role quando data mudar
  useEffect(() => {
    if (data) {
      setRole(data);
    }
  }, [data]);

  // Obter permissões baseadas no role
  const permissions = ROLE_PERMISSIONS[role];

  // Helpers para verificação de role
  // Email fmbp1981@gmail.com SEMPRE tem acesso admin irrestrito
  const isAdmin = user?.email === 'fmbp1981@gmail.com' || role === 'admin';
  const isOperador = role === 'operador';
  const isVisualizador = role === 'visualizador';

  /**
   * Verifica se usuário tem uma permissão específica
   */
  const hasPermission = (permission: keyof RolePermissions): boolean => {
    return permissions[permission];
  };

  return {
    role,
    permissions,
    isLoading,
    isAdmin,
    isOperador,
    isVisualizador,
    hasPermission,
    refetch,
  };
}
