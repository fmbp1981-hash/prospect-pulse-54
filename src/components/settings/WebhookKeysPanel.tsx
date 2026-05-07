'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Key, Plus, Trash2, Copy, Check, RefreshCw } from 'lucide-react';

interface WebhookKey {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

interface NewKeyResult extends WebhookKey {
  key: string;
}

export function WebhookKeysPanel() {
  const [keys, setKeys] = useState<WebhookKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyResult, setNewKeyResult] = useState<NewKeyResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/webhook-keys');
      if (!res.ok) throw new Error('Erro ao carregar chaves');
      setKeys(await res.json());
    } catch {
      toast.error('Erro ao carregar API keys');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/webhook-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!res.ok) throw new Error('Erro ao criar chave');
      const result: NewKeyResult = await res.json();
      setNewKeyResult(result);
      setNewKeyName('');
      await loadKeys();
    } catch {
      toast.error('Erro ao gerar API key');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revogar esta chave? O n8n deixará de funcionar com ela.')) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/webhook-keys/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao revogar');
      toast.success('Chave revogada');
      await loadKeys();
    } catch {
      toast.error('Erro ao revogar chave');
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = () => {
    if (!newKeyResult) return;
    navigator.clipboard.writeText(newKeyResult.key).catch(() => {
      toast.error('Falha ao copiar. Selecione e copie manualmente.');
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Nunca';
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          API Keys — Integrações Externas
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Use estas chaves para integrar com n8n, Zapier ou qualquer ferramenta externa.
          A chave só é exibida uma vez na criação.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Nome da chave (ex: n8n Apollo)"
          value={newKeyName}
          onChange={e => setNewKeyName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          className="max-w-xs"
        />
        <Button onClick={handleCreate} disabled={isCreating || !newKeyName.trim()} className="gap-2">
          {isCreating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Gerar Chave
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma API key gerada ainda.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {keys.map(k => (
            <div key={k.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-sm">{k.name}</p>
                <p className="text-xs text-muted-foreground">
                  Criada em {formatDate(k.created_at)} · Último uso: {formatDate(k.last_used_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">lpk_••••••••</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Revogar"
                  disabled={revokingId === k.id}
                  onClick={() => handleRevoke(k.id)}
                >
                  {revokingId === k.id
                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4 text-destructive" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!newKeyResult}
        onOpenChange={(open) => {
          if (!open && !copied) {
            if (!confirm('Você copiou a chave? Ela não poderá ser recuperada.')) return;
          }
          if (!open) setNewKeyResult(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Gerada — &quot;{newKeyResult?.name}&quot;</DialogTitle>
            <DialogDescription>
              Copie esta chave agora. Ela não será exibida novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-lg p-4 font-mono text-sm break-all">
            {newKeyResult?.key}
          </div>
          <Button onClick={handleCopy} variant="outline" className="gap-2">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado!' : 'Copiar Chave'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Cole esta chave no campo <code>x-api-key</code> do seu workflow n8n.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
