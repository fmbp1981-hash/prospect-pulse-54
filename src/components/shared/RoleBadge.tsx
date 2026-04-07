import { Badge } from "@/components/ui/badge";
import { useUserRole } from "@/hooks/useUserRole";
import { ROLE_LABELS, ROLE_COLORS } from "@/types/roles";
import { ShieldCheck, UserCog, Eye } from "lucide-react";

const ROLE_ICONS = {
  admin: ShieldCheck,
  operador: UserCog,
  visualizador: Eye,
};

interface RoleBadgeProps {
  /** Mostrar ícone junto com o texto */
  showIcon?: boolean;
  /** Variante do badge */
  variant?: "default" | "outline";
  /** Classe CSS customizada */
  className?: string;
}

/**
 * Badge que exibe o role do usuário atual
 *
 * @example
 * ```tsx
 * <RoleBadge showIcon />
 * ```
 */
export function RoleBadge({ showIcon = true, variant = "default", className }: RoleBadgeProps) {
  const { role, isLoading } = useUserRole();

  if (isLoading) {
    return (
      <Badge variant="outline" className={className}>
        Carregando...
      </Badge>
    );
  }

  const Icon = ROLE_ICONS[role];
  const colorClass = ROLE_COLORS[role];

  return (
    <Badge
      variant={variant}
      className={`${colorClass} text-white gap-1 ${className || ""}`}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {ROLE_LABELS[role]}
    </Badge>
  );
}
