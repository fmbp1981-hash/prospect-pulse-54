'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ImportHistoryRow {
  id: string;
  source: 'manual' | 'webhook' | 'google_drive';
  filename: string | null;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  import_id: string;
  created_at: string;
}

const SOURCE_LABELS: Record<ImportHistoryRow['source'], { label: string; className: string }> = {
  google_drive: { label: 'Drive', className: 'bg-blue-100 text-blue-800' },
  manual:       { label: 'Manual', className: 'bg-gray-100 text-gray-800' },
  webhook:      { label: 'API', className: 'bg-purple-100 text-purple-800' },
};

function formatResult(row: ImportHistoryRow): string {
  const parts: string[] = [];
  if (row.created > 0)  parts.push(`+${row.created} criados`);
  if (row.updated > 0)  parts.push(`${row.updated} atualizados`);
  if (row.skipped > 0)  parts.push(`${row.skipped} ignorados`);
  if (row.errors > 0)   parts.push(`${row.errors} erros`);
  return parts.join(' · ') || 'Sem alterações';
}

export function ImportHistoryPanel() {
  const [rows, setRows] = useState<ImportHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const LIMIT = 20;

  const fetchHistory = useCallback(async (currentOffset: number, append: boolean) => {
    try {
      const res = await fetch(`/api/leads/import/history?limit=${LIMIT}&offset=${currentOffset}`);
      if (!res.ok) return;
      const json = await res.json() as { data: ImportHistoryRow[]; total: number };
      setRows(prev => append ? [...prev, ...json.data] : json.data);
      setTotal(json.total);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(0, false);
    const interval = setInterval(() => fetchHistory(0, false), 30_000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const handleLoadMore = () => {
    const nextOffset = offset + LIMIT;
    setOffset(nextOffset);
    setLoadingMore(true);
    fetchHistory(nextOffset, true);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Carregando histórico...</span>
      </div>
    );
  }

  return (
    <div id="import-history">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">Histórico de Importações</h3>
        <Button variant="ghost" size="sm" onClick={() => fetchHistory(0, false)} className="gap-1 h-7">
          <RefreshCw className="h-3 w-3" />
          Atualizar
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Nenhuma importação registrada ainda.</p>
      ) : (
        <>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Data</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Arquivo</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Origem</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(row => {
                  const src = SOURCE_LABELS[row.source];
                  return (
                    <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: ptBR })}
                      </td>
                      <td className="px-3 py-2 max-w-[180px] truncate" title={row.filename ?? '—'}>
                        {row.filename ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={`text-xs ${src.className}`}>{src.label}</Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatResult(row)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length < total && (
            <div className="mt-3 text-center">
              <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Carregar mais ({total - rows.length} restantes)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
