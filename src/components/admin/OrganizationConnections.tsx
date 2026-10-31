'use client';

/**
 * Admin da PLATAFORMA: integrações de cada organização (Sprint 2b).
 *
 * Lista as conexões da organização escolhida, cria/edita (PUT), testa, ativa
 * (só depois de teste aprovado), desativa e remove. Segredos nunca são
 * pré-preenchidos: o campo mostra só "configurado (…1234)" e, vazio, mantém o
 * segredo atual. O servidor revalida tudo e restringe ao admin da plataforma.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Pencil, Plus, Power, PowerOff, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  CATEGORY_LABELS,
  CONNECTION_STATUS_QUERY_KEY,
  PROVIDER_LABELS,
  formatConnectionStatus,
} from '@/hooks/useConnectionStatus';
import { STATUS_TONE_CLASSES, formatDateTime } from '@/components/connections/ConnectionStatusList';
import { PROVIDER_CATEGORY, PROVIDER_IDS } from '@/lib/validations/connections';
import type { ConnectionView } from '@/lib/services/connections-admin.service';
import type { ConnectorCategory, CredentialSource, ProviderId } from '@/lib/connectors/types';
import {
  PROVIDER_CONFIG_FIELDS,
  PROVIDER_SECRET_FIELDS,
  adminRequest,
  configString,
  filledValues,
  initialConnectionForm,
  secretPlaceholder,
} from './connection-admin-shared';

interface Organization {
  id: string;
  name: string;
}

export const ADMIN_ORGANIZATIONS_QUERY_KEY = ['admin', 'organizations'] as const;

/**
 * Organizações (GET /api/admin/organizations). Responde 403 para quem não é
 * admin da plataforma — a tela usa o sucesso dessa consulta para decidir se
 * mostra as abas do admin.
 */
export function useAdminOrganizations(enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_ORGANIZATIONS_QUERY_KEY,
    queryFn: () => adminRequest<Organization[]>('/api/admin/organizations'),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

const CATEGORIES: readonly ConnectorCategory[] = ['whatsapp', 'email', 'llm', 'prospecting'];

function providersOf(category: ConnectorCategory): ProviderId[] {
  return PROVIDER_IDS.filter((p) => PROVIDER_CATEGORY[p] === category);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Falha ao processar a solicitação.';
}

// ─── formulário (criar/editar) ─────────────────────────────────────────────

interface ConnectionFormProps {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Conexão em edição; ausente = nova conexão. */
  editing: ConnectionView | null;
}

function ConnectionFormDialog({ orgId, open, onOpenChange, editing }: ConnectionFormProps) {
  const queryClient = useQueryClient();
  // O diálogo só fica montado enquanto aberto (ver OrganizationConnections): ao
  // fechar/salvar o estado é descartado, então nenhum segredo digitado fica em memória.
  const [initial] = useState(() => initialConnectionForm(editing));
  const [category, setCategory] = useState<ConnectorCategory>(initial.category);
  const [provider, setProvider] = useState<ProviderId>(initial.provider);
  const [credentialSource, setCredentialSource] = useState<CredentialSource>(initial.credentialSource);
  const [config, setConfig] = useState<Record<string, string>>(initial.config);
  const [secret, setSecret] = useState<Record<string, string>>(initial.secret);

  const changeCategory = (value: ConnectorCategory) => {
    setCategory(value);
    setProvider(providersOf(value)[0]);
    // WhatsApp é sempre credencial própria; as demais começam pela da plataforma.
    setCredentialSource(value === 'whatsapp' ? 'own' : 'platform');
    setConfig({});
    setSecret({});
  };

  const changeProvider = (value: ProviderId) => {
    setProvider(value);
    setConfig({});
    setSecret({});
  };

  const save = useMutation({
    mutationFn: () =>
      adminRequest<ConnectionView>(`/api/admin/organizations/${orgId}/connections`, {
        method: 'PUT',
        body: {
          category,
          provider,
          credentialSource,
          config: filledValues(config) ?? {},
          ...(credentialSource === 'own' && filledValues(secret)
            ? { secret: filledValues(secret) }
            : {}),
        },
      }),
    onSuccess: () => {
      setSecret({});
      toast.success('Conexão salva. Teste a conexão antes de ativar.');
      queryClient.invalidateQueries({ queryKey: ['admin', 'connections', orgId] });
      queryClient.invalidateQueries({ queryKey: CONNECTION_STATUS_QUERY_KEY });
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const isEditing = editing !== null;
  const configFields = PROVIDER_CONFIG_FIELDS[provider];
  const secretFields = PROVIDER_SECRET_FIELDS[provider];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar conexão' : 'Nova conexão'}</DialogTitle>
          <DialogDescription>
            Após salvar, a conexão fica aguardando teste. Ative só depois de um teste aprovado.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="conn-category">Categoria</Label>
              <Select
                value={category}
                onValueChange={(v) => changeCategory(v as ConnectorCategory)}
                disabled={isEditing}
              >
                <SelectTrigger id="conn-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-provider">Provedor</Label>
              <Select
                value={provider}
                onValueChange={(v) => changeProvider(v as ProviderId)}
                disabled={isEditing}
              >
                <SelectTrigger id="conn-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providersOf(category).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PROVIDER_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="conn-source">Credencial</Label>
            <Select
              value={credentialSource}
              onValueChange={(v) => setCredentialSource(v as CredentialSource)}
              disabled={category === 'whatsapp'}
            >
              <SelectTrigger id="conn-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {category !== 'whatsapp' && (
                  <SelectItem value="platform">Credencial da plataforma (IntelliX)</SelectItem>
                )}
                <SelectItem value="own">Credencial própria da organização</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {configFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`conn-config-${field.key}`}>
                {field.label}
                {field.optional && <span className="text-muted-foreground"> (opcional)</span>}
              </Label>
              <Input
                id={`conn-config-${field.key}`}
                value={config[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
                autoComplete="off"
              />
            </div>
          ))}

          {credentialSource === 'own' &&
            secretFields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`conn-secret-${field.key}`}>{field.label}</Label>
                <Input
                  id={`conn-secret-${field.key}`}
                  type="password"
                  value={secret[field.key] ?? ''}
                  placeholder={
                    editing && editing.credentialSource === 'own'
                      ? secretPlaceholder(editing.hasSecret, editing.secretHint)
                      : ''
                  }
                  onChange={(e) => setSecret((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  autoComplete="new-password"
                  className="font-mono"
                />
              </div>
            ))}
          {credentialSource === 'own' && isEditing && editing.hasSecret && (
            <p className="text-xs text-muted-foreground">
              Deixe os campos de segredo em branco para manter o segredo atual. Para trocar, preencha
              todos.
            </p>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── cartão de uma conexão ─────────────────────────────────────────────────

interface ConnectionCardProps {
  orgId: string;
  connection: ConnectionView;
  onEdit: (connection: ConnectionView) => void;
}

function ConnectionCard({ orgId, connection, onEdit }: ConnectionCardProps) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const base = `/api/admin/organizations/${orgId}/connections/${connection.id}`;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'connections', orgId] });
    queryClient.invalidateQueries({ queryKey: CONNECTION_STATUS_QUERY_KEY });
  };

  const test = useMutation({
    mutationFn: () =>
      adminRequest<{ connection: ConnectionView; result: { ok: boolean; message: string } }>(
        `${base}/test`,
        { method: 'POST' }
      ),
    onSuccess: ({ result }) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const setStatus = useMutation({
    mutationFn: (status: 'active' | 'disabled') =>
      adminRequest<ConnectionView>(base, { method: 'PATCH', body: { status } }),
    onSuccess: (updated) => {
      toast.success(updated.status === 'active' ? 'Conexão ativada.' : 'Conexão desativada.');
      refresh();
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: () => adminRequest<{ id: string }>(base, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Conexão removida.');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const display = formatConnectionStatus(connection.status);
  const tested = formatDateTime(connection.lastTestedAt);
  const busy = test.isPending || setStatus.isPending || remove.isPending;

  const copyWebhook = async () => {
    if (!connection.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(connection.webhookUrl);
      toast.success('URL do webhook copiada.');
    } catch {
      toast.error('Não foi possível copiar a URL.');
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{PROVIDER_LABELS[connection.provider]}</p>
          <p className="text-xs text-muted-foreground">
            {CATEGORY_LABELS[connection.category]} ·{' '}
            {connection.credentialSource === 'platform'
              ? 'Credencial da plataforma'
              : connection.hasSecret
                ? `Credencial própria ${secretPlaceholder(true, connection.secretHint)}`
                : 'Credencial própria (sem segredo)'}
          </p>
        </div>
        <Badge className={cn('w-fit', STATUS_TONE_CLASSES[display.tone])}>{display.label}</Badge>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {connection.provider === 'evolution' && (
          <p className="break-all">
            Instância: <span className="font-mono">{configString(connection.config, 'instanceName')}</span>
            {' · '}
            {configString(connection.config, 'baseUrl')}
          </p>
        )}
        {connection.provider === 'meta_cloud' && (
          <p className="break-all">
            Phone Number ID:{' '}
            <span className="font-mono">{configString(connection.config, 'phoneNumberId')}</span>
          </p>
        )}
        {connection.provider === 'resend' && (
          <p className="break-all">
            Domínio: <span className="font-mono">{configString(connection.config, 'domain')}</span>
            {' · '}
            Verificação:{' '}
            {!connection.lastTestedAt
              ? 'ainda não testado'
              : connection.lastTestOk
                ? 'domínio verificado'
                : 'não verificado'}
          </p>
        )}
        {connection.provider === 'openai' && configString(connection.config, 'model') && (
          <p>Modelo: {configString(connection.config, 'model')}</p>
        )}
        {tested && (
          <p>
            Último teste: {tested}
            {connection.lastTestResult ? ` · ${connection.lastTestResult}` : ''}
          </p>
        )}
      </div>

      {connection.webhookUrl && (
        <div className="space-y-1">
          <Label htmlFor={`webhook-${connection.id}`} className="text-xs">
            URL do webhook (configure no provedor)
          </Label>
          <div className="flex gap-2">
            <Input
              id={`webhook-${connection.id}`}
              value={connection.webhookUrl}
              readOnly
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={copyWebhook}
              aria-label="Copiar URL do webhook"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={busy}>
          {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
          Testar conexão
        </Button>
        {connection.status !== 'active' && (
          <Button
            size="sm"
            onClick={() => setStatus.mutate('active')}
            disabled={busy || !connection.lastTestOk}
            title={connection.lastTestOk ? undefined : 'Teste a conexão com sucesso antes de ativar.'}
          >
            <Power className="mr-2 h-4 w-4" />
            Ativar
          </Button>
        )}
        {connection.status !== 'disabled' && (
          <Button size="sm" variant="outline" onClick={() => setStatus.mutate('disabled')} disabled={busy}>
            <PowerOff className="mr-2 h-4 w-4" />
            Desativar
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onEdit(connection)} disabled={busy}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          onClick={() => setConfirmDelete(true)}
          disabled={busy}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Remover
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conexão?</AlertDialogTitle>
            <AlertDialogDescription>
              A organização deixa de usar {PROVIDER_LABELS[connection.provider]} imediatamente. O
              segredo gravado é apagado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── tela ──────────────────────────────────────────────────────────────────

export function OrganizationConnections() {
  const organizations = useAdminOrganizations(true);
  const [orgId, setOrgId] = useState<string>('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConnectionView | null>(null);

  const connections = useQuery({
    queryKey: ['admin', 'connections', orgId],
    queryFn: () => adminRequest<ConnectionView[]>(`/api/admin/organizations/${orgId}/connections`),
    enabled: orgId !== '',
    retry: false,
  });

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (connection: ConnectionView) => {
    setEditing(connection);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="admin-org">Organização</Label>
          <Select value={orgId} onValueChange={setOrgId} disabled={organizations.isLoading}>
            <SelectTrigger id="admin-org">
              <SelectValue placeholder={organizations.isLoading ? 'Carregando...' : 'Selecione a organização'} />
            </SelectTrigger>
            <SelectContent>
              {(organizations.data ?? []).map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openNew} disabled={orgId === ''} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Nova conexão
        </Button>
      </div>

      {organizations.isError && (
        <p className="text-sm text-destructive">{errorMessage(organizations.error)}</p>
      )}

      {orgId !== '' && connections.isLoading && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando conexões...
        </div>
      )}
      {connections.isError && (
        <p className="text-sm text-destructive">{errorMessage(connections.error)}</p>
      )}
      {connections.data && connections.data.length === 0 && (
        <p className="py-4 text-sm text-muted-foreground">
          Nenhuma conexão cadastrada para esta organização.
        </p>
      )}
      {connections.data && connections.data.length > 0 && (
        <div className="space-y-3">
          {connections.data.map((c) => (
            <ConnectionCard key={c.id} orgId={orgId} connection={c} onEdit={openEdit} />
          ))}
        </div>
      )}

      {orgId !== '' && formOpen && (
        <ConnectionFormDialog
          orgId={orgId}
          open={formOpen}
          onOpenChange={setFormOpen}
          editing={editing}
        />
      )}
    </div>
  );
}
