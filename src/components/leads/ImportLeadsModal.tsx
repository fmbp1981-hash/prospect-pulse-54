'use client';

import { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ImportLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: (count: number) => void;
}

type ImportResult = {
  imported: number;
  skipped: number;
  total: number;
  errors: string[];
};

const SUPPORTED = ['.csv', '.xlsx', '.xls', '.vcf', '.txt'];

export function ImportLeadsModal({ isOpen, onClose, onImported }: ImportLeadsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    setIsUploading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!SUPPORTED.includes(`.${ext}`)) {
      toast.error(`Formato .${ext} não suportado`, {
        description: `Formatos aceitos: ${SUPPORTED.join(', ')}`,
      });
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/leads/import', { method: 'POST', body: formData });
      const json: ImportResult & { error?: string } = await res.json();

      if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`);

      setResult(json);
      if (json.imported > 0) {
        toast.success(`${json.imported} leads importados!`, {
          description: json.skipped > 0 ? `${json.skipped} duplicatas ignoradas.` : undefined,
        });
        onImported?.(json.imported);
      } else {
        toast.warning('Nenhum lead importado', { description: 'Verifique o arquivo e tente novamente.' });
      }
    } catch (err) {
      toast.error('Erro na importação', { description: String(err) });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary" />
            Importar Leads
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dropzone */}
          {!result && (
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
                ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60'}
                ${file ? 'bg-primary/5 border-primary/40' : ''}
              `}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={SUPPORTED.join(',')}
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              {file ? (
                <div className="space-y-2">
                  <FileText className="h-10 w-10 text-primary mx-auto" />
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <p className="text-xs text-primary">Clique para trocar o arquivo</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <UploadCloud className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm font-medium">Arraste ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground">
                    Aceita: {SUPPORTED.join(', ')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div className="space-y-3">
              <div className="bg-muted rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Importação concluída</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="bg-background rounded-lg p-2">
                    <p className="text-lg font-bold text-green-600">{result.imported}</p>
                    <p className="text-xs text-muted-foreground">Importados</p>
                  </div>
                  <div className="bg-background rounded-lg p-2">
                    <p className="text-lg font-bold text-amber-600">{result.skipped}</p>
                    <p className="text-xs text-muted-foreground">Ignorados</p>
                  </div>
                  <div className="bg-background rounded-lg p-2">
                    <p className="text-lg font-bold">{result.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    {result.errors.length} erro(s)
                  </div>
                  <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5 max-h-24 overflow-y-auto">
                    {result.errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
                    {result.errors.length > 10 && (
                      <li className="text-muted-foreground">...e mais {result.errors.length - 10} erros</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs">{file?.name}</Badge>
              </div>
            </div>
          )}

          {/* Dicas */}
          {!result && !file && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium">Colunas esperadas no CSV/XLSX:</p>
              <p className="text-xs text-muted-foreground">
                <code>empresa</code>, <code>contato</code>, <code>whatsapp</code>,{' '}
                <code>email</code>, <code>cidade</code>, <code>categoria</code>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Para VCF: dados de contatos do WhatsApp são extraídos automaticamente.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <>
              <Button variant="outline" onClick={reset}>Importar outro arquivo</Button>
              <Button onClick={handleClose}>Fechar</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
              <Button onClick={handleUpload} disabled={!file || isUploading}>
                {isUploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isUploading ? 'Importando...' : 'Importar'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
