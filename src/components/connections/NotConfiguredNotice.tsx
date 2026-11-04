'use client';

/**
 * Aviso exibido nas telas que dependem de uma conexão da organização quando a
 * categoria (ou o provedor) não está `active`. Não aparece enquanto o status
 * carrega nem se a consulta falhar (o servidor recusa o envio de qualquer forma).
 */
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  NOT_CONFIGURED_MESSAGES,
  isConfigured,
  useConnectionStatus,
} from '@/hooks/useConnectionStatus';
import type { ConnectorCategory, ProviderId } from '@/lib/connectors/types';

interface NotConfiguredNoticeProps {
  category: ConnectorCategory;
  /** Restringe a um provedor específico (ex.: google_places na prospecção por mapa). */
  provider?: ProviderId;
  className?: string;
}

export function NotConfiguredNotice({ category, provider, className }: NotConfiguredNoticeProps) {
  const { isLoading, isError, statusOf } = useConnectionStatus();
  if (isLoading || isError || isConfigured(statusOf(category, provider))) return null;

  return (
    <Alert
      className={cn(
        'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 [&>svg]:text-amber-600',
        className
      )}
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="text-sm">{NOT_CONFIGURED_MESSAGES[category]}</AlertDescription>
    </Alert>
  );
}
