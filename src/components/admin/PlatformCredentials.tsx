'use client';

/**
 * Admin da PLATAFORMA: credenciais da plataforma (IntelliX) usadas pelas
 * conexões com `credentialSource = platform` (e-mail, IA e prospecção).
 * WhatsApp é sempre credencial própria da organização, por isso não aparece.
 *
 * O servidor exige o segredo completo a cada gravação; os campos nunca são
 * pré-preenchidos (só "configurado (…1234)"). A config não secreta (remetente
 * do Resend para os e-mails do sistema) é pré-preenchida e reenviada inteira.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CATEGORY_LABELS, PROVIDER_LABELS } from '@/hooks/useConnectionStatus';
import { formatDateTime } from '@/components/connections/ConnectionStatusList';
import { PROVIDER_CATEGORY, PROVIDER_IDS } from '@/lib/validations/connections';
import type { PlatformCredentialView } from '@/lib/services/connections-admin.service';
import type { ProviderId } from '@/lib/connectors/types';
import {
  PROVIDER_CONFIG_FIELDS,
  PROVIDER_SECRET_FIELDS,
  adminRequest,
  type FormField,
  filledValues,
  secretPlaceholder,
} from './connection-admin-shared';

const PLATFORM_PROVIDERS: readonly ProviderId[] = PROVIDER_IDS.filter(
  (p) => PROVIDER_CATEGORY[p] !== 'whatsapp'
);

const QUERY_KEY = ['admin', 'platform-credentials'] as const;

/**
 * Config da credencial da plataforma por provedor. Só o Resend tem: o
 * remetente dos e-mails do sistema (o domínio é o da conta da plataforma,
 * por isso `domain` não entra). Espelha platformCredentialConfigSchemas.
 */
const PLATFORM_CONFIG_FIELDS: Partial<Record<ProviderId, readonly FormField[]>> = {
  resend: PROVIDER_CONFIG_FIELDS.resend.filter((f) => f.key !== 'domain'),
};

function initialConfig(
  provider: ProviderId,
  credential: PlatformCredentialView | undefined
): Record<string, string> {
  const fields = PLATFORM_CONFIG_FIELDS[provider] ?? [];
  return Object.fromEntries(fields.map((f) => [f.key, credential?.config[f.key] ?? '']));
}

interface CredentialFormProps {
  provider: ProviderId;
  credential: PlatformCredentialView | undefined;
}

function CredentialForm({ provider, credential }: CredentialFormProps) {
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>(() =>
    initialConfig(provider, credential)
  );
  const fields = PROVIDER_SECRET_FIELDS[provider];
  const configFields = PLATFORM_CONFIG_FIELDS[provider] ?? [];

  const save = useMutation({
    mutationFn: () =>
      adminRequest<PlatformCredentialView>('/api/admin/platform-credentials', {
        method: 'PUT',
        body: {
          provider,
          secret: filledValues(secret) ?? {},
          // O PUT substitui a linha inteira: a config vai sempre completa.
          config: filledValues(config) ?? {},
        },
      }),
    onSuccess: () => {
      toast.success(`Credencial da plataforma (${PROVIDER_LABELS[provider]}) salva.`);
      setSecret({});
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar a credencial.'),
  });

  const updated = formatDateTime(credential?.updatedAt ?? null);

  return (
    <form
      className="space-y-3 rounded-lg border p-3 sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">{PROVIDER_LABELS[provider]}</p>
          <p className="text-xs text-muted-foreground">
            {CATEGORY_LABELS[PROVIDER_CATEGORY[provider]]}
            {updated ? ` · atualizado em ${updated}` : ''}
          </p>
        </div>
        <Badge variant={credential?.hasSecret ? 'default' : 'secondary'} className="w-fit">
          {credential?.hasSecret ? 'Configurada' : 'Não configurada'}
        </Badge>
      </div>

      {configFields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={`platform-${provider}-config-${field.key}`}>{field.label}</Label>
          <Input
            id={`platform-${provider}-config-${field.key}`}
            type={field.key === 'fromEmail' ? 'email' : 'text'}
            value={config[field.key] ?? ''}
            placeholder={field.placeholder}
            onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
          />
        </div>
      ))}

      {fields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={`platform-${provider}-${field.key}`}>{field.label}</Label>
          <Input
            id={`platform-${provider}-${field.key}`}
            type="password"
            value={secret[field.key] ?? ''}
            placeholder={secretPlaceholder(
              credential?.hasSecret ?? false,
              credential?.secretHint ?? null
            )}
            onChange={(e) => setSecret((prev) => ({ ...prev, [field.key]: e.target.value }))}
            autoComplete="new-password"
            className="font-mono"
          />
        </div>
      ))}

      <Button
        type="submit"
        size="sm"
        disabled={save.isPending || !filledValues(secret)}
        className="w-full sm:w-auto"
      >
        {save.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Salvar
      </Button>
    </form>
  );
}

export function PlatformCredentials() {
  const credentials = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => adminRequest<PlatformCredentialView[]>('/api/admin/platform-credentials'),
    retry: false,
  });

  if (credentials.isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando credenciais...
      </div>
    );
  }

  if (credentials.isError) {
    return (
      <p className="text-sm text-destructive">
        {credentials.error instanceof Error ? credentials.error.message : 'Falha ao carregar.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
        Usadas pelas conexões configuradas com &ldquo;Credencial da plataforma&rdquo;. O consumo é
        registrado por organização.
      </p>
      {PLATFORM_PROVIDERS.map((provider) => (
        <CredentialForm
          key={provider}
          provider={provider}
          credential={credentials.data?.find((c) => c.provider === provider)}
        />
      ))}
    </div>
  );
}
