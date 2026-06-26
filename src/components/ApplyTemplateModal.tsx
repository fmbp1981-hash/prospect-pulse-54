"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, CheckCircle, Star, Mail, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { Lead } from "@/types/prospection";
import { supabaseCRM } from "@/lib/supabaseCRM";
import { userSettingsService } from "@/lib/userSettings";
import { INTELLIX_WA_TEMPLATES } from "@/lib/whatsapp-templates/intellix-wa-templates";
import { INTELLIX_EMAIL_TEMPLATES } from "@/lib/email-templates/intellix-email-templates";

interface ApplyTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLeads: Lead[];
  onTemplateApplied: () => void;
  /** Called when an email template is selected — parent should open EmailCampaignModal with this id */
  onEmailTemplateSelected?: (templateId: string) => void;
}

interface FlatTemplate {
  id: string;
  name: string;
  segment: string;
  body: string;
  subject?: string;
  isPreset: boolean;
  channel: 'whatsapp' | 'email';
}

const CUSTOM_STORAGE_KEY = 'custom_templates_v2';

// Detect best template ID for a category string
function detectSegmentId(categoria: string): string {
  const cat = (categoria || '').toLowerCase();
  if (/constru|im[oó]vel|imobiliar|incorpor/.test(cat)) return 'construcao_v1';
  if (/jur[ií]d|advocac|direito|adv\./.test(cat)) return 'juridico_v1';
  if (/sa[úu]de|cl[ií]nica|odonto|labor|m[eé]dico|hospital|farm/.test(cat)) return 'saude_v1';
  if (/atacado|distribu|food|aliment|hortifr/.test(cat)) return 'atacado_v1';
  if (/tecnolog|ti\b|telecom|software|suporte|dev|sistema/.test(cat)) return 'tech_v1';
  if (/marketi|ag[eê]nci|publicid|tr[áa]fego|m[íi]dia/.test(cat)) return 'agencia_v1';
  if (/consultor|financei|seguro|cons[oó]rc|banco|cr[eé]dito|invest/.test(cat)) return 'financeiro_v1';
  if (/solar|energia|fotovolt/.test(cat)) return 'energiasolar_v1';
  return 'universal_v1';
}

function detectBestTemplateId(leads: Lead[], channel: 'whatsapp' | 'email'): string {
  // Count segment matches across all selected leads
  const counts: Record<string, number> = {};
  for (const lead of leads) {
    const seg = detectSegmentId(lead.categoria || '');
    counts[seg] = (counts[seg] || 0) + 1;
  }
  // Pick the most frequent segment (ignore universal unless it's the only one)
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const best = entries[0]?.[0] || 'universal_v1';
  const prefix = channel === 'whatsapp' ? 'intellix_er_' : 'intellix_email_';
  return `${prefix}${best}`;
}

function buildWaTemplates(): FlatTemplate[] {
  const presets: FlatTemplate[] = INTELLIX_WA_TEMPLATES.map(t => ({
    id: t.id, name: t.name, segment: t.segment, body: t.body, isPreset: true, channel: 'whatsapp',
  }));
  const saved = localStorage.getItem(CUSTOM_STORAGE_KEY);
  let customs: FlatTemplate[] = [];
  if (saved) {
    try {
      const all = JSON.parse(saved) as Array<{ id: string; name: string; channel: string; segment: string; body: string }>;
      customs = all
        .filter(t => t.channel === 'whatsapp')
        .map(t => ({ id: t.id, name: t.name, segment: t.segment, body: t.body, isPreset: false, channel: 'whatsapp' as const }));
    } catch { /* ignore */ }
  }
  return [...presets, ...customs];
}

function buildEmailTemplates(): FlatTemplate[] {
  const presets: FlatTemplate[] = INTELLIX_EMAIL_TEMPLATES.map(t => ({
    id: t.id, name: t.name, segment: t.segment, body: t.body, subject: t.subject, isPreset: true, channel: 'email',
  }));
  const saved = localStorage.getItem(CUSTOM_STORAGE_KEY);
  let customs: FlatTemplate[] = [];
  if (saved) {
    try {
      const all = JSON.parse(saved) as Array<{ id: string; name: string; channel: string; segment: string; body: string; subject?: string }>;
      customs = all
        .filter(t => t.channel === 'email')
        .map(t => ({ id: t.id, name: t.name, segment: t.segment, body: t.body, subject: t.subject, isPreset: false, channel: 'email' as const }));
    } catch { /* ignore */ }
  }
  return [...presets, ...customs];
}

function replaceWaVars(body: string, lead: Lead, companyName: string): string {
  const nome = lead.contato || lead.empresa || '';
  const empresa = lead.empresa || '';
  return body
    .replace(/\{\{nome\}\}/g, nome)
    .replace(/\{\{empresa\}\}/g, empresa)
    .replace(/\{\{cidade\}\}/g, lead.cidade || '')
    .replace(/\{\{categoria\}\}/g, lead.categoria || '')
    .replace(/\{\{minha_empresa\}\}/g, companyName || 'IntelliX.AI')
    .replace(/\{\{contato\}\}/g, nome)
    .replace(/\{\{lead\}\}/g, lead.lead || '');
}

export function ApplyTemplateModal({
  isOpen,
  onClose,
  selectedLeads,
  onTemplateApplied,
  onEmailTemplateSelected,
}: ApplyTemplateModalProps) {
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [waTemplates, setWaTemplates] = useState<FlatTemplate[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<FlatTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<FlatTemplate | null>(null);
  const [recommendedId, setRecommendedId] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);
  const [companyName, setCompanyName] = useState('IntelliX.AI');

  useEffect(() => {
    if (!isOpen) return;

    const wa = buildWaTemplates();
    const email = buildEmailTemplates();
    setWaTemplates(wa);
    setEmailTemplates(email);

    // Auto-detect best template from selected leads' categories
    const bestId = detectBestTemplateId(selectedLeads, channel);
    setRecommendedId(bestId);
    const templates = channel === 'whatsapp' ? wa : email;
    const autoMatch = templates.find(t => t.id === bestId) || null;
    setSelectedTemplate(autoMatch);

    userSettingsService.getUserSettings().then(s => {
      if (s?.company_name) setCompanyName(s.company_name);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleChannelChange = (ch: string) => {
    const newCh = ch as 'whatsapp' | 'email';
    setChannel(newCh);
    const templates = newCh === 'whatsapp' ? waTemplates : emailTemplates;
    const bestId = detectBestTemplateId(selectedLeads, newCh);
    setRecommendedId(bestId);
    setSelectedTemplate(templates.find(t => t.id === bestId) || null);
  };

  const handleApply = async () => {
    if (!selectedTemplate) { toast.error('Selecione um template'); return; }
    if (selectedLeads.length === 0) { toast.error('Nenhum lead selecionado'); return; }

    if (channel === 'email') {
      onEmailTemplateSelected?.(selectedTemplate.id);
      onClose();
      return;
    }

    setIsApplying(true);
    try {
      await Promise.all(
        selectedLeads.map(lead =>
          supabaseCRM.updateLead(lead.id, {
            mensagemWhatsApp: replaceWaVars(selectedTemplate.body, lead, companyName),
          })
        )
      );
      toast.success(`Template aplicado a ${selectedLeads.length} lead(s)`, {
        description: 'Mensagens prontas para envio via WhatsApp!',
      });
      onTemplateApplied();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao aplicar template');
    } finally {
      setIsApplying(false);
    }
  };

  const templates = channel === 'whatsapp' ? waTemplates : emailTemplates;
  const previewLead = selectedLeads[0];
  const applyLabel = channel === 'email'
    ? 'Usar este template no Email'
    : `Aplicar aos ${selectedLeads.length} Lead(s)`;

  // Reorder: recommended first (if not universal), then universal, then rest
  const universalId = channel === 'whatsapp' ? 'intellix_er_universal_v1' : 'intellix_email_universal_v1';
  const orderedTemplates = [...templates].sort((a, b) => {
    if (a.id === recommendedId && a.id !== universalId) return -1;
    if (b.id === recommendedId && b.id !== universalId) return 1;
    if (a.id === universalId) return -1;
    if (b.id === universalId) return 1;
    return 0;
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col gap-0">
        <DialogHeader className="pb-3">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Aplicar Template aos Leads Selecionados
          </DialogTitle>
        </DialogHeader>

        {/* Channel tabs */}
        <Tabs value={channel} onValueChange={handleChannelChange} className="mb-3">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="whatsapp" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Info bar */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-3 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">
                {selectedLeads.length} lead(s) selecionado(s)
              </p>
            </div>
            {recommendedId && recommendedId !== universalId && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <Zap className="h-3.5 w-3.5" />
                <span>Template sugerido pelo perfil do lead</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {channel === 'whatsapp'
              ? 'Mensagem personalizada com dados de cada lead antes de salvar.'
              : 'Selecione o template de email. Você poderá revisar antes de enviar.'}
          </p>
        </div>

        {/* Scrollable template list — min-h-0 is required for flex-1 scroll to work */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum template disponível</p>
              <p className="text-sm mt-1">Acesse o Gerenciador de Templates para criar</p>
            </div>
          ) : (
            <ScrollArea className="h-full pr-2">
              <div className="space-y-2 pb-2">
                {orderedTemplates.map(tpl => {
                  const isSelected = selectedTemplate?.id === tpl.id;
                  const isRecommended = tpl.id === recommendedId && tpl.id !== universalId;
                  const isUniversal = tpl.id === universalId;

                  const previewText = channel === 'whatsapp' && previewLead
                    ? replaceWaVars(tpl.body, previewLead, companyName)
                    : tpl.body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

                  return (
                    <Card
                      key={tpl.id}
                      className={`p-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-primary border-2 bg-primary/5 shadow-sm'
                          : 'hover:border-primary/40 hover:bg-muted/30'
                      }`}
                      onClick={() => setSelectedTemplate(tpl)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-sm">{tpl.name}</h4>
                            {isRecommended && (
                              <Badge className="gap-1 text-xs bg-amber-500 hover:bg-amber-500 text-white border-0">
                                <Sparkles className="h-3 w-3" />
                                Sugerido
                              </Badge>
                            )}
                            {isUniversal && (
                              <Badge variant="outline" className="gap-1 text-xs">
                                Universal
                              </Badge>
                            )}
                            {tpl.isPreset && !isRecommended && !isUniversal && (
                              <Badge variant="secondary" className="gap-1 text-xs">
                                <Star className="h-3 w-3" />
                                IntelliX
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{tpl.segment}</p>
                          {tpl.subject && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Assunto: <em>{tpl.subject.replace(/\{\{empresa\}\}/g, previewLead?.empresa || '…')}</em>
                            </p>
                          )}
                        </div>
                        {isSelected && <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />}
                      </div>

                      <div className={`rounded-lg p-2.5 text-xs leading-relaxed ${
                        isRecommended ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-muted/60'
                      }`}>
                        {channel === 'whatsapp' && previewLead ? (
                          <p className="whitespace-pre-wrap line-clamp-4">{previewText}</p>
                        ) : (
                          <p className="text-muted-foreground line-clamp-3">{previewText}…</p>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 pt-3 border-t mt-3">
          <Button variant="outline" onClick={onClose} disabled={isApplying}>
            Cancelar
          </Button>
          <Button
            onClick={handleApply}
            disabled={!selectedTemplate || isApplying || selectedLeads.length === 0}
          >
            {isApplying ? 'Aplicando...' : applyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
