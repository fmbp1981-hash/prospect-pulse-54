'use client';

/**
 * Status (somente leitura) das integrações da organização do usuário.
 * Nenhum dado de configuração ou segredo: só categoria, provedor, status e
 * data do último teste.
 */
import { Bot, Mail, MessageSquare, RefreshCw, Search, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CATEGORY_LABELS,
  PROVIDER_LABELS,
  formatConnectionStatus,
  useConnectionStatus,
  type ConnectionStatusItem,
  type StatusTone,
} from '@/hooks/useConnectionStatus';
import type { ConnectorCategory } from '@/lib/connectors/types';

const CATEGORY_ORDER: readonly ConnectorCategory[] = ['whatsapp', 'email', 'llm', 'prospecting'];

const CATEGORY_ICONS: Record<ConnectorCategory, LucideIcon> = {
  whatsapp: MessageSquare,
  email: Mail,
  llm: Bot,
  prospecting: Search,
};

export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-green-600 text-white hover:bg-green-600',
  warning: 'bg-amber-500 text-white hover:bg-amber-500',
  danger: 'bg-red-600 text-white hover:bg-red-600',
  muted: 'bg-muted text-muted-foreground hover:bg-muted',
};

export function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function StatusRow({ item }: { item: ConnectionStatusItem }) {
  const display = formatConnectionStatus(item.status);
  const tested = formatDateTime(item.lastTestedAt);
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{PROVIDER_LABELS[item.provider]}</p>
        {tested && <p className="text-xs text-muted-foreground">Último teste: {tested}</p>}
      </div>
      <Badge className={cn('w-fit', STATUS_TONE_CLASSES[display.tone])}>{display.label}</Badge>
    </div>
  );
}

export function ConnectionStatusList() {
  const { items, isLoading, isError, refetch } = useConnectionStatus();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Carregando integrações...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-2 py-4 text-sm sm:flex-row sm:items-center">
        <span className="text-destructive">Não foi possível carregar o status das integrações.</span>
        <Button variant="outline" size="sm" className="w-fit" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const notConfigured = formatConnectionStatus(undefined);

  return (
    <div className="space-y-3">
      {CATEGORY_ORDER.map((category) => {
        const Icon = CATEGORY_ICONS[category];
        const rows = items.filter((i) => i.category === category);
        return (
          <div key={category} className="rounded-lg border p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">{CATEGORY_LABELS[category]}</h3>
            </div>
            {rows.length === 0 ? (
              <Badge className={cn('w-fit', STATUS_TONE_CLASSES[notConfigured.tone])}>
                {notConfigured.label}
              </Badge>
            ) : (
              rows.map((item) => <StatusRow key={`${item.category}-${item.provider}`} item={item} />)
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        A equipe IntelliX configura as integrações da sua empresa. Se algo estiver com falha ou não
        configurado, fale com a equipe IntelliX.
      </p>
    </div>
  );
}
