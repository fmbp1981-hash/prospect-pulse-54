'use client';

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Megaphone, Plus, Play, RefreshCw, CheckCircle2, AlertCircle, Loader2, Clock,
} from "lucide-react";
import { toast } from "sonner";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  channel: 'whatsapp' | 'email';
  status: 'draft' | 'running' | 'completed' | 'paused';
  total_sent: number;
  total_failed: number;
  created_at: string;
  completed_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  running: "Enviando",
  completed: "Concluída",
  paused: "Pausada",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "📱 WhatsApp",
  email: "📧 Email",
};

interface NewCampaignForm {
  name: string;
  description: string;
  channel: 'whatsapp' | 'email';
  subject: string;
  body: string;
}

export default function CampanhasPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSending, setIsSending] = useState<string | null>(null);
  const [form, setForm] = useState<NewCampaignForm>({
    name: '', description: '', channel: 'whatsapp', subject: '', body: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/campaigns');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCampaigns(json.campaigns ?? []);
    } catch (err) {
      toast.error("Erro ao carregar campanhas", { description: String(err) });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!form.body.trim()) { toast.error("Texto da mensagem é obrigatório"); return; }
    if (form.channel === 'email' && !form.subject.trim()) { toast.error("Assunto é obrigatório para email"); return; }

    setIsSaving(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          channel: form.channel,
          subject: form.channel === 'email' ? form.subject : undefined,
          body: form.body,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Campanha criada!", { description: "Clique em Enviar para disparar." });
      setIsCreateOpen(false);
      setForm({ name: '', description: '', channel: 'whatsapp', subject: '', body: '' });
      loadCampaigns();
    } catch (err) {
      toast.error("Erro ao criar campanha", { description: String(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async (campaign: Campaign) => {
    if (!confirm(`Disparar "${campaign.name}" para todos os leads ${CHANNEL_LABELS[campaign.channel]}?`)) return;
    setIsSending(campaign.id);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/send`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Campanha disparada!", {
        description: `${json.sent} enviados, ${json.failed} falhas.`,
      });
      loadCampaigns();
    } catch (err) {
      toast.error("Erro ao disparar campanha", { description: String(err) });
    } finally {
      setIsSending(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Megaphone className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Campanhas</h1>
            <p className="text-muted-foreground text-sm">
              Disparo em massa por WhatsApp ou Email
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadCampaigns} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Campanha
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enviados</TableHead>
                <TableHead>Falhas</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Carregando campanhas...
                  </TableCell>
                </TableRow>
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Nenhuma campanha criada ainda.
                  </TableCell>
                </TableRow>
              ) : campaigns.map((c, i) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <TableCell>
                    <p className="font-medium">{c.name}</p>
                    {c.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{c.description}</p>
                    )}
                  </TableCell>
                  <TableCell>{CHANNEL_LABELS[c.channel]}</TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${STATUS_COLORS[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {c.status === 'completed' && (
                      <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        {c.total_sent}
                      </span>
                    )}
                    {c.status !== 'completed' && <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {c.status === 'completed' && c.total_failed > 0 ? (
                      <span className="flex items-center gap-1 text-destructive text-sm font-medium">
                        <AlertCircle className="h-3 w-3" />
                        {c.total_failed}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(c.created_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {c.status === 'draft' && (
                      <Button
                        size="sm"
                        disabled={isSending === c.id}
                        onClick={() => handleSend(c)}
                        className="h-7 px-3"
                      >
                        {isSending === c.id
                          ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          : <Play className="h-3 w-3 mr-1" />}
                        Enviar
                      </Button>
                    )}
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal Criar Campanha */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Campanha</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="camp-name">Nome</Label>
              <Input
                id="camp-name"
                placeholder="Ex: Follow-up Março 2026"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="camp-desc">Descrição (opcional)</Label>
              <Input
                id="camp-desc"
                placeholder="Breve descrição do objetivo"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div>
              <Label>Canal</Label>
              <Select
                value={form.channel}
                onValueChange={v => setForm(f => ({ ...f, channel: v as 'whatsapp' | 'email' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">📱 WhatsApp</SelectItem>
                  <SelectItem value="email">📧 Email</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.channel === 'email' && (
              <div>
                <Label htmlFor="camp-subject">Assunto do email</Label>
                <Input
                  id="camp-subject"
                  placeholder="Assunto"
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                />
              </div>
            )}

            <div>
              <Label htmlFor="camp-body">
                {form.channel === 'whatsapp' ? 'Mensagem WhatsApp' : 'Corpo do email (HTML ou texto)'}
              </Label>
              <Textarea
                id="camp-body"
                rows={6}
                placeholder={
                  form.channel === 'whatsapp'
                    ? "Olá! Estamos com uma oferta especial para você..."
                    : "<p>Olá, <strong>{empresa}</strong>...</p>"
                }
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Campanha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
