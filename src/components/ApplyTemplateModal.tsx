"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, CheckCircle, Star, Mail } from "lucide-react";
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
  const [isApplying, setIsApplying] = useState(false);
  const [companyName, setCompanyName] = useState('IntelliX.AI');

  useEffect(() => {
    if (isOpen) {
      setWaTemplates(buildWaTemplates());
      setEmailTemplates(buildEmailTemplates());
      setSelectedTemplate(null);
      userSettingsService.getUserSettings().then(s => {
        if (s?.company_name) setCompanyName(s.company_name);
      }).catch(() => {});
    }
  }, [isOpen]);

  // Reset selection when switching channel
  const handleChannelChange = (ch: string) => {
    setChannel(ch as 'whatsapp' | 'email');
    setSelectedTemplate(null);
  };

  const handleApply = async () => {
    if (!selectedTemplate) { toast.error('Selecione um template'); return; }
    if (selectedLeads.length === 0) { toast.error('Nenhum lead selecionado'); return; }

    if (channel === 'email') {
      // For email: delegate to parent which will open EmailCampaignModal pre-selected
      onEmailTemplateSelected?.(selectedTemplate.id);
      onClose();
      return;
    }

    // WhatsApp: save personalized message to each lead
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Aplicar Template aos Leads Selecionados
          </DialogTitle>
        </DialogHeader>

        <Tabs value={channel} onValueChange={handleChannelChange}>
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

        <div className="flex-1 overflow-hidden flex flex-col space-y-3">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">
                {selectedLeads.length} lead(s) selecionado(s)
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {channel === 'whatsapp'
                ? 'A mensagem será personalizada com os dados de cada lead antes de salvar.'
                : 'Selecione um template de email. Você poderá revisar e enviar no próximo passo.'}
            </p>
          </div>

          {templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum template disponível</p>
              <p className="text-sm mt-1">Acesse o Gerenciador de Templates para criar</p>
            </div>
          ) : (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-3">
                {templates.map(tpl => {
                  const isSelected = selectedTemplate?.id === tpl.id;
                  const preview = channel === 'whatsapp' && previewLead
                    ? replaceWaVars(tpl.body, previewLead, companyName)
                    : tpl.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);

                  return (
                    <Card
                      key={tpl.id}
                      className={`p-4 cursor-pointer transition-all space-y-3 ${
                        isSelected ? 'border-primary border-2 bg-primary/5' : 'hover:border-primary/50'
                      }`}
                      onClick={() => setSelectedTemplate(tpl)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h4 className="font-semibold">{tpl.name}</h4>
                            {tpl.isPreset && (
                              <Badge variant="secondary" className="gap-1 text-xs">
                                <Star className="h-3 w-3" />
                                IntelliX
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">{tpl.segment}</Badge>
                            {tpl.subject && (
                              <span className="text-xs text-muted-foreground">
                                Assunto: <em>{tpl.subject.replace(/\{\{empresa\}\}/g, previewLead?.empresa || '…')}</em>
                              </span>
                            )}
                          </div>
                        </div>
                        {isSelected && <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />}
                      </div>

                      <div className="bg-muted p-3 rounded-lg">
                        {channel === 'whatsapp' && previewLead ? (
                          <>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Preview para {previewLead.empresa || previewLead.lead}:
                            </p>
                            <p className="text-xs whitespace-pre-wrap leading-relaxed">{preview}</p>
                          </>
                        ) : (
                          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-4">{preview}…</p>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 pt-2">
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
