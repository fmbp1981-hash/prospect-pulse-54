'use client';

import { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2,
  AlertTriangle, X, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { normalizeLeadRow } from '@/lib/import/normalizer';
import { deduplicateLeads } from '@/lib/import/deduplicator';
import { mapColumnsViaApi, mapColumnsLocally, LEAD_FIELDS } from '@/lib/import/column-mapper';
import type {
  ColumnMapping, MergedLead, NormalizedLead,
  RawMappedLead, LeadField, ImportReport,
} from '@/lib/import/types';

const SUPPORTED_EXTS = ['.csv', '.xlsx', '.xls', '.vcf', '.txt'];
const REQUIRED_FIELDS: LeadField[] = ['empresa'];
const MAX_LEADS = 1000;
const MAX_FILE_MB = 10;

type Step = 1 | 2 | 3 | 4;

interface ImportLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: (count: number) => void;
}

// ─── Parsers ───────────────────────────────────────────────────────────────────

function parseFile(file: File): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'csv' || ext === 'txt') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const result = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        const columns = result.meta.fields ?? [];
        resolve({ columns, rows: result.data });
      };
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        resolve({
          columns,
          rows: rows.map(r =>
            Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))
          ),
        });
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    } else if (ext === 'vcf') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const cards = text.split(/BEGIN:VCARD/i).slice(1);
        const rows = cards.map(card => {
          const get = (field: string) =>
            card.match(new RegExp(`${field}[^:]*:(.+)`, 'i'))?.[1]?.trim() ?? '';
          return {
            empresa: get('ORG') || get('FN'),
            lead: get('FN'),
            whatsapp: get('TEL;TYPE=WHATSAPP') || get('TEL;CELL') || get('TEL;MOBILE') || get('TEL'),
            email: get('EMAIL'),
          };
        }).filter(r => r.lead || r.whatsapp);
        resolve({ columns: ['empresa', 'lead', 'whatsapp', 'email'], rows });
      };
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    } else {
      reject(new Error(`Formato não suportado: .${ext}`));
    }
  });
}

function applyMappings(
  rows: Record<string, string>[],
  mappings: ColumnMapping[]
): RawMappedLead[] {
  return rows.map(row => {
    const mapped: RawMappedLead = {};
    for (const m of mappings) {
      if (m.targetField !== 'ignore') {
        const val = row[m.sourceColumn]?.trim();
        if (val) {
          const existing = mapped[m.targetField];
          // Concatena com espaço quando dois campos mapeiam para o mesmo target
          // (ex: Apollo "First Name" + "Last Name" → contato)
          mapped[m.targetField] = existing ? `${existing} ${val}` : val;
        }
      }
    }
    return mapped;
  });
}

function generateReportCSV(report: ImportReport): string {
  const header = 'Empresa,Status,Motivo\n';
  const body = report.rows
    .map(r =>
      `"${r.empresa.replace(/"/g, '""')}","${r.status}","${(r.reason ?? '').replace(/"/g, '""')}"`
    )
    .join('\n');
  return header + body;
}

// ─── Componente Principal ──────────────────────────────────────────────────────

export function ImportLeadsModal({ isOpen, onClose, onImported }: ImportLeadsModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMapping, setIsMapping] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [mergedLeads, setMergedLeads] = useState<MergedLead[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep(1);
    setFile(null);
    setColumns([]);
    setRawRows([]);
    setMappings([]);
    setMergedLeads([]);
    setReport(null);
    setIsMapping(false);
    setIsImporting(false);
  }, []);

  const handleClose = () => {
    if (step === 2 || step === 3) {
      if (!confirm('Tem certeza? O progresso do mapeamento será perdido.')) return;
    }
    reset();
    onClose();
  };

  const handleFile = (f: File) => {
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Arquivo muito grande (máx. ${MAX_FILE_MB}MB)`);
      return;
    }
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!SUPPORTED_EXTS.includes(`.${ext}`)) {
      toast.error(`Formato .${ext} não suportado`, {
        description: `Aceito: ${SUPPORTED_EXTS.join(', ')}`,
      });
      return;
    }
    setFile(f);
    setReport(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const goToMapping = async () => {
    if (!file) return;
    setIsMapping(true);
    try {
      const parsed = await parseFile(file);
      let rows = parsed.rows;

      if (rows.length > MAX_LEADS) {
        toast.warning(
          `Arquivo com ${rows.length} leads — apenas os primeiros ${MAX_LEADS} serão importados`
        );
        rows = rows.slice(0, MAX_LEADS);
      }

      setColumns(parsed.columns);
      setRawRows(rows);

      const sample = rows.slice(0, 5);

      let result;
      try {
        result = await mapColumnsViaApi({ columns: parsed.columns, sample });
      } catch {
        result = mapColumnsLocally(parsed.columns);
        toast.warning('Mapeamento por IA indisponível — usando fallback local');
      }

      const allMappings: ColumnMapping[] = [
        ...result.mappings,
        ...result.unmapped.map(col => ({
          sourceColumn: col,
          targetField: 'ignore' as const,
          confidence: 0,
        })),
      ];
      setMappings(allMappings);
      setStep(2);
    } catch (err) {
      toast.error('Erro ao ler o arquivo', { description: String(err) });
    } finally {
      setIsMapping(false);
    }
  };

  const goToPreview = () => {
    const rawMapped = applyMappings(rawRows, mappings.filter(m => m.targetField !== 'ignore'));
    const normalized = rawMapped.map(r => normalizeLeadRow(r));
    const deduplicated = deduplicateLeads(normalized);
    setMergedLeads(deduplicated);
    setStep(3);
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const resolved = mergedLeads.map(ml => {
        const lead = { ...ml.normalized };
        for (const conflict of ml.conflicts) {
          if (conflict.resolution === 'a') {
            (lead as Record<string, unknown>)[conflict.field] = conflict.valueA;
          } else if (conflict.resolution === 'b') {
            (lead as Record<string, unknown>)[conflict.field] = conflict.valueB;
          } else if (conflict.resolution === 'custom') {
            (lead as Record<string, unknown>)[conflict.field] =
              conflict.customValue ?? conflict.valueA;
          } else if (conflict.resolution === 'both') {
            (lead as Record<string, unknown>)[conflict.field] =
              `${conflict.valueA}; ${conflict.valueB}`;
          }
        }
        return lead;
      });

      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: resolved, options: { defaultOrigem: 'importação' } }),
      });
      const json: ImportReport & { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`);

      setReport(json);
      setStep(4);
      if (json.created + json.updated > 0) {
        onImported?.(json.created + json.updated);
      }
    } catch (err) {
      toast.error('Erro na importação', { description: String(err) });
    } finally {
      setIsImporting(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;
    const csv = generateReportCSV(report);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-importacao-${report.importId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const invalidLeads = mergedLeads.filter(
    ml => Object.keys(ml.normalized.errors).length > 0
  );
  const conflictLeads = mergedLeads.filter(
    ml => ml.conflicts.some(c => !c.resolution)
  );
  const readyLeads = mergedLeads.filter(
    ml =>
      Object.keys(ml.normalized.errors).length === 0 &&
      ml.conflicts.every(c => c.resolution)
  );
  const allConflictsResolved = mergedLeads.every(ml =>
    ml.conflicts.every(c => c.resolution)
  );
  const requiredMapped = REQUIRED_FIELDS.every(f =>
    mappings.some(m => m.targetField === f)
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary" />
            Importar Leads
            <span className="ml-auto text-xs text-muted-foreground font-normal">
              Etapa {step} de 4
            </span>
          </DialogTitle>
          <Progress value={step * 25} className="h-1 mt-2" />
        </DialogHeader>

        {/* ── Etapa 1: Upload ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
                ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60'}
                ${file ? 'bg-primary/5 border-primary/40' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={SUPPORTED_EXTS.join(',')}
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              {file ? (
                <div className="space-y-2">
                  <FileText className="h-10 w-10 text-primary mx-auto" />
                  <p className="font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <p className="text-xs text-primary">Clique para trocar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <UploadCloud className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="font-medium">Arraste ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground">
                    CSV · XLSX · VCF · TXT · máx. {MAX_FILE_MB}MB · até {MAX_LEADS} leads
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Etapa 2: Mapeamento de Colunas ── */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A IA mapeou as colunas automaticamente. Revise e corrija se necessário.
            </p>
            {!requiredMapped && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Campos obrigatórios sem mapeamento:{' '}
                {REQUIRED_FIELDS.filter(f => !mappings.some(m => m.targetField === f)).join(', ')}
              </div>
            )}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Coluna na planilha</th>
                    <th className="text-left p-3 font-medium">Campo no sistema</th>
                    <th className="text-left p-3 font-medium w-24">Confiança</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m, i) => (
                    <tr
                      key={i}
                      className={`border-t ${
                        m.confidence < 0.8 && m.targetField !== 'ignore'
                          ? 'bg-yellow-50 dark:bg-yellow-900/10'
                          : ''
                      }`}
                    >
                      <td className="p-3 font-mono text-xs">{m.sourceColumn}</td>
                      <td className="p-3">
                        <Select
                          value={m.targetField}
                          onValueChange={val =>
                            setMappings(prev =>
                              prev.map((pm, pi) =>
                                pi === i
                                  ? { ...pm, targetField: val as LeadField | 'ignore' }
                                  : pm
                              )
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ignore">— Ignorar coluna —</SelectItem>
                            {LEAD_FIELDS.map(f => (
                              <SelectItem key={f} value={f}>
                                {f}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        {m.targetField === 'ignore' ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={`text-xs font-medium ${
                              m.confidence >= 0.8 ? 'text-green-600' : 'text-yellow-600'
                            }`}
                          >
                            {Math.round(m.confidence * 100)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              {rawRows.length} linhas encontradas no arquivo
            </p>
          </div>
        )}

        {/* ── Etapa 3: Preview + Conflitos ── */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" /> {readyLeads.length} prontos
              </span>
              <span className="flex items-center gap-1 text-yellow-600">
                <AlertTriangle className="h-4 w-4" /> {conflictLeads.length} conflitos
              </span>
              <span className="flex items-center gap-1 text-destructive">
                <X className="h-4 w-4" /> {invalidLeads.length} inválidos
              </span>
            </div>

            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">Todos ({mergedLeads.length})</TabsTrigger>
                <TabsTrigger value="ready">Prontos ({readyLeads.length})</TabsTrigger>
                <TabsTrigger value="conflicts">Conflitos ({conflictLeads.length})</TabsTrigger>
                <TabsTrigger value="invalid">Inválidos ({invalidLeads.length})</TabsTrigger>
              </TabsList>

              {(['all', 'ready', 'conflicts', 'invalid'] as const).map(tab => {
                const list =
                  tab === 'all'
                    ? mergedLeads
                    : tab === 'ready'
                    ? readyLeads
                    : tab === 'conflicts'
                    ? conflictLeads
                    : invalidLeads;

                return (
                  <TabsContent key={tab} value={tab} className="space-y-2 mt-2">
                    {list.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum lead nesta categoria
                      </p>
                    )}
                    {list.map((ml, i) => {
                      const mlIndex = mergedLeads.indexOf(ml);
                      return (
                        <div key={i} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">
                              {ml.normalized.empresa}
                            </span>
                            <div className="flex gap-1 flex-wrap">
                              {ml.normalized.whatsapp && (
                                <Badge variant="outline" className="text-xs">
                                  {ml.normalized.whatsapp}
                                </Badge>
                              )}
                              {ml.existsInDb && (
                                <Badge variant="secondary" className="text-xs">
                                  Vai mesclar (DB)
                                </Badge>
                              )}
                              {Object.keys(ml.normalized.errors).length > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  Inválido
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Erros de validação */}
                          {Object.entries(ml.normalized.errors).map(([field, err]) => (
                            <p key={field} className="text-xs text-destructive">
                              ❌ {field}: {err}
                            </p>
                          ))}

                          {/* Warnings de normalização */}
                          {Object.entries(ml.normalized.warnings).map(([field, warn]) => (
                            <p key={field} className="text-xs text-yellow-600">
                              ⚠ {field}: {warn}
                            </p>
                          ))}

                          {/* Conflitos entre duplicatas */}
                          {ml.conflicts.map((conflict, ci) => (
                            <div
                              key={ci}
                              className="bg-yellow-50 dark:bg-yellow-900/10 rounded-lg p-2 space-y-2"
                            >
                              <p className="text-xs font-medium">
                                Conflito no campo: <code>{conflict.field}</code>
                              </p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-white dark:bg-background rounded p-1 border">
                                  <p className="text-muted-foreground">Opção A</p>
                                  <p className="font-mono">{conflict.valueA}</p>
                                </div>
                                <div className="bg-white dark:bg-background rounded p-1 border">
                                  <p className="text-muted-foreground">Opção B</p>
                                  <p className="font-mono">{conflict.valueB}</p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {(['a', 'b', 'both'] as const).map(res => (
                                  <Button
                                    key={res}
                                    size="sm"
                                    variant={conflict.resolution === res ? 'default' : 'outline'}
                                    className="text-xs h-6"
                                    onClick={() => {
                                      setMergedLeads(prev =>
                                        prev.map((pml, pi) =>
                                          pi === mlIndex
                                            ? {
                                                ...pml,
                                                conflicts: pml.conflicts.map((pc, pci) =>
                                                  pci === ci
                                                    ? { ...pc, resolution: res }
                                                    : pc
                                                ),
                                              }
                                            : pml
                                        )
                                      );
                                    }}
                                  >
                                    {res === 'a'
                                      ? 'Usar A'
                                      : res === 'b'
                                      ? 'Usar B'
                                      : 'Manter ambos'}
                                  </Button>
                                ))}
                              </div>
                              {conflict.resolution === 'custom' && (
                                <Input
                                  className="h-7 text-xs"
                                  placeholder="Digite o valor..."
                                  value={conflict.customValue ?? ''}
                                  onChange={e => {
                                    setMergedLeads(prev =>
                                      prev.map((pml, pi) =>
                                        pi === mlIndex
                                          ? {
                                              ...pml,
                                              conflicts: pml.conflicts.map((pc, pci) =>
                                                pci === ci
                                                  ? { ...pc, customValue: e.target.value }
                                                  : pc
                                              ),
                                            }
                                          : pml
                                      )
                                    );
                                  }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
        )}

        {/* ── Etapa 4: Resultado ── */}
        {step === 4 && report && (
          <div className="space-y-4">
            <div className="bg-muted rounded-xl p-6 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
              <p className="font-semibold text-lg">Importação concluída!</p>
            </div>
            <div className="grid grid-cols-4 gap-3 text-center text-sm">
              {[
                { label: 'Criados', value: report.created, color: 'text-green-600' },
                { label: 'Atualizados', value: report.updated, color: 'text-blue-600' },
                { label: 'Ignorados', value: report.skipped, color: 'text-yellow-600' },
                { label: 'Erros', value: report.errors, color: 'text-destructive' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-background border rounded-lg p-3">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p>Arquivo: {file?.name}</p>
              <p>Origem definida como: &quot;importação&quot; · Estágio inicial: &quot;Novo&quot;</p>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <div className="flex gap-2">
            {step > 1 && step < 4 && (
              <Button variant="ghost" onClick={() => setStep(s => (s - 1) as Step)}>
                ← Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 4 ? (
              <>
                <Button variant="outline" onClick={downloadReport} className="gap-2">
                  <Download className="h-4 w-4" /> Baixar relatório
                </Button>
                <Button onClick={() => { reset(); onClose(); }}>Fechar</Button>
              </>
            ) : step === 3 ? (
              <>
                <Button variant="ghost" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={isImporting || !allConflictsResolved || readyLeads.length === 0}
                >
                  {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Importar {readyLeads.length} lead{readyLeads.length !== 1 ? 's' : ''}
                </Button>
              </>
            ) : step === 2 ? (
              <>
                <Button variant="ghost" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button onClick={goToPreview} disabled={!requiredMapped}>
                  Próximo →
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button onClick={goToMapping} disabled={!file || isMapping}>
                  {isMapping && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isMapping ? 'Analisando...' : 'Próximo →'}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
