'use client';

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  FileText, Eye, Pencil, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  INTELLIX_EMAIL_TEMPLATES,
  type EmailTemplate,
} from "@/lib/email-templates/intellix-email-templates";

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
  draft:     "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  running:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  paused:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

const STATUS_LABELS: Record<string, string> = {
  draft:     "Rascunho",
  running:   "Enviando",
  completed: "Concluída",
  paused:    "Pausada",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "📱 WhatsApp",
  email:    "📧 Email",
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
  const [isLoading, setIsLoading]     = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSending, setIsSending]     = useState<string | null>(null);
  const [form, setForm] = useState<NewCampaignForm>({
    name: '', description: '', channel: 'whatsapp', subject: '', body: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  // Template picker state
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [templateMode, setTemplateMode] = useState<'pick' | 'edit'>('pick');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    setIsLoading(true);
    try {
      const res  = await fetch('/api/campaigns');
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

  // When channel changes reset template state
  useEffect(() => {
    if (form.channel !== 'email') {
      setSelectedTemplate(null);
      setTemplateMode('pick');
      setPreviewHtml(null);
    }
  }, [form.channel]);

  const handlePickTemplate = (tpl: EmailTemplate) => {
    setSelectedTemplate(tpl);
    setForm(f => ({ ...f, subject: tpl.subject, body: tpl.body }));
    setPreviewHtml(null);
    setTemplateMode('edit');
  };

  const handleClearTemplate = () => {
    setSelectedTemplate(null);
    setForm(f => ({ ...f, subject: '', body: '' }));
    setPreviewHtml(null);
    setTemplateMode('pick');
  };

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
          name:        form.name,
          description: form.description || undefined,
          channel:     form.channel,
          subject:     form.channel === 'email' ? form.subject : undefined,
          body:        form.body,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Campanha criada!", { description: "Clique em Enviar para disparar." });
      setIsCreateOpen(false);
      setForm({ name: '', description: '', channel: 'whatsapp', subject: '', body: '' });
      setSelectedTemplate(null);
      setTemplateMode('pick');
      setPreviewHtml(null);
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
      const res  = await fetch(`/api/campaigns/${campaign.id}/send`, { method: 'POST' });
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
                    {c.status === 'completed' ? (
                      <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                        <CheckCircle2 className="h-3 w-3" />{c.total_sent}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {c.status === 'completed' && c.total_failed > 0 ? (
                      <span className="flex items-center gap-1 text-destructive text-sm font-medium">
                        <AlertCircle className="h-3 w-3" />{c.total_failed}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />{formatDate(c.created_at)}
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
      <Dialog open={isCreateOpen} onOpenChange={(open) => {
        setIsCreateOpen(open);
        if (!open) {
          setForm({ name: '', description: '', channel: 'whatsapp', subject: '', body: '' });
          setSelectedTemplate(null);
          setTemplateMode('pick');
          setPreviewHtml(null);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Campanha</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Nome e Descrição */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="camp-name">Nome <span className="text-red-500">*</span></Label>
                <Input
                  id="camp-name"
                  placeholder="Ex: Prospecção Energia Solar — Junho"
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
            </div>

            {/* Canal */}
            <div>
              <Label>Canal</Label>
              <Select
                value={form.channel}
                onValueChange={v => setForm(f => ({ ...f, channel: v as 'whatsapp' | 'email' }))}
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">📱 WhatsApp</SelectItem>
                  <SelectItem value="email">📧 Email</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── EMAIL: Template Picker ── */}
            {form.channel === 'email' && (
              <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Templates de Prospecção por Email
                  </p>
                  {selectedTemplate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearTemplate}
                      className="text-xs text-muted-foreground h-7"
                    >
                      Trocar template
                    </Button>
                  )}
                </div>

                {templateMode === 'pick' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {INTELLIX_EMAIL_TEMPLATES.map(tpl => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handlePickTemplate(tpl)}
                        className="text-left p-3 border rounded-lg bg-background hover:border-primary hover:bg-primary/5 transition-colors group"
                      >
                        <p className="text-sm font-medium group-hover:text-primary transition-colors">
                          {tpl.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {tpl.segment}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">
                          Assunto: {tpl.subject}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {templateMode === 'edit' && selectedTemplate && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-md">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm font-medium text-primary">{selectedTemplate.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">— {selectedTemplate.segment}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Assunto (email) */}
            {form.channel === 'email' && templateMode === 'edit' && (
              <div>
                <Label htmlFor="camp-subject">
                  Assunto do email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="camp-subject"
                  placeholder="Assunto que aparece na caixa de entrada"
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use <code className="bg-muted px-1 rounded">{"{{empresa}}"}</code> ou <code className="bg-muted px-1 rounded">{"{{nome}}"}</code> para personalizar
                </p>
              </div>
            )}

            {/* Corpo */}
            {(form.channel === 'whatsapp' || (form.channel === 'email' && templateMode === 'edit')) && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="camp-body">
                    {form.channel === 'whatsapp' ? 'Mensagem WhatsApp' : 'Corpo do email (HTML)'}
                    <span className="text-red-500 ml-1">*</span>
                  </Label>
                  {form.channel === 'email' && form.body && (
                    <Tabs
                      defaultValue="edit"
                      onValueChange={v => setPreviewHtml(v === 'preview' ? form.body : null)}
                    >
                      <TabsList className="h-7">
                        <TabsTrigger value="edit" className="text-xs h-6 px-2 gap-1">
                          <Pencil className="h-3 w-3" />Editar
                        </TabsTrigger>
                        <TabsTrigger value="preview" className="text-xs h-6 px-2 gap-1">
                          <Eye className="h-3 w-3" />Preview
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  )}
                </div>

                {previewHtml ? (
                  <div
                    className="border rounded-lg overflow-hidden bg-[#f5f5f5]"
                    style={{ minHeight: 320 }}
                  >
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full border-0"
                      style={{ minHeight: 480 }}
                      sandbox="allow-same-origin"
                      title="Preview do email"
                    />
                  </div>
                ) : (
                  <>
                    <Textarea
                      id="camp-body"
                      rows={form.channel === 'email' ? 10 : 6}
                      placeholder={
                        form.channel === 'whatsapp'
                          ? "Olá! Estamos com uma oferta especial para você..."
                          : "<p>Olá, <strong>{{nome}}</strong>...</p>"
                      }
                      value={form.body}
                      onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                      className="font-mono text-xs"
                    />
                    {form.channel === 'email' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Variáveis disponíveis:{' '}
                        {['{{empresa}}', '{{nome}}', '{{cidade}}', '{{categoria}}'].map(v => (
                          <code key={v} className="bg-muted px-1 rounded mr-1">{v}</code>
                        ))}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Info quando email mas ainda não escolheu template */}
            {form.channel === 'email' && templateMode === 'pick' && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-200">
                <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Selecione um dos templates acima para preencher o assunto e corpo do email automaticamente. Você poderá editar depois.</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCreate}
              disabled={
                isSaving ||
                !form.name.trim() ||
                !form.body.trim() ||
                (form.channel === 'email' && !form.subject.trim())
              }
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Campanha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
