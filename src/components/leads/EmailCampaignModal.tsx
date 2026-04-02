'use client';

import { useState } from 'react';
import { Lead } from '@/types/prospection';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface EmailCampaignModalProps {
  open: boolean;
  onClose: () => void;
  selectedLeads: Lead[];
}

interface SendResult {
  sent: number;
  failed: number;
  skipped: number;
}

export function EmailCampaignModal({ open, onClose, selectedLeads }: EmailCampaignModalProps) {
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState(
    `Olá {{nome}},\n\nEspero que esteja bem!\n\nSomos da XPAG Brasil e gostaríamos de apresentar nossas soluções para a {{empresa}}.\n\nTemos ajudado empresas a reduzir custos com elisão fiscal, split de pagamentos e meios de pagamento com taxas competitivas.\n\nGostaria de conhecer mais? Responda este email ou entre em contato conosco.\n\nAtenciosamente,\nEquipe XPAG Brasil`
  );
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const leadsWithEmail = selectedLeads.filter(l => l.email?.trim());
  const leadsWithoutEmail = selectedLeads.length - leadsWithEmail.length;

  const handleSend = async () => {
    if (!subject.trim()) {
      toast.error('Informe o assunto do email');
      return;
    }
    if (!htmlBody.trim()) {
      toast.error('Informe o corpo do email');
      return;
    }
    if (leadsWithEmail.length === 0) {
      toast.error('Nenhum lead selecionado possui email');
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch('/api/email/send-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: selectedLeads.map(l => l.id),
          subject: subject.trim(),
          htmlBody: htmlBody.replace(/\n/g, '<br>'),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao enviar emails');
      }

      setResult(data);
      toast.success(`${data.sent} email${data.sent !== 1 ? 's' : ''} enviado${data.sent !== 1 ? 's' : ''} com sucesso!`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Erro ao enviar emails', { description: message });
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Enviar Email para Leads
          </DialogTitle>
          <DialogDescription>
            Compose um email para os leads selecionados. Use{' '}
            <code className="bg-muted px-1 rounded text-xs">{'{{nome}}'}</code> e{' '}
            <code className="bg-muted px-1 rounded text-xs">{'{{empresa}}'}</code> como variáveis personalizadas.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <span className="text-2xl font-bold text-green-700 dark:text-green-400">{result.sent}</span>
                <span className="text-sm text-muted-foreground">Enviados</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                <AlertCircle className="h-8 w-8 text-red-600" />
                <span className="text-2xl font-bold text-red-700 dark:text-red-400">{result.failed}</span>
                <span className="text-sm text-muted-foreground">Falhas</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-muted border">
                <Mail className="h-8 w-8 text-muted-foreground" />
                <span className="text-2xl font-bold">{result.skipped}</span>
                <span className="text-sm text-muted-foreground">Sem email</span>
              </div>
            </div>
            <Button onClick={handleClose} className="w-full">Fechar</Button>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Summary */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm">
              <span>
                <strong>{selectedLeads.length}</strong> leads selecionados —{' '}
                <strong className="text-green-600">{leadsWithEmail.length}</strong> com email
              </span>
              {leadsWithoutEmail > 0 && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {leadsWithoutEmail} sem email (ignorados)
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Assunto</Label>
              <Input
                id="subject"
                placeholder="Ex: Soluções de pagamento para sua empresa"
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Corpo do email</Label>
              <Textarea
                id="body"
                placeholder="Escreva o corpo do email..."
                value={htmlBody}
                onChange={e => setHtmlBody(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Variáveis disponíveis: <code>{'{{nome}}'}</code> (nome do contato) e <code>{'{{empresa}}'}</code> (nome da empresa)
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={handleClose} className="flex-1" disabled={isSending}>
                Cancelar
              </Button>
              <Button
                onClick={handleSend}
                disabled={isSending || leadsWithEmail.length === 0}
                className="flex-1 gap-2"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Enviar para {leadsWithEmail.length} lead{leadsWithEmail.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
