"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, CheckCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { Lead } from "@/types/prospection";
import { supabaseCRM } from "@/lib/supabaseCRM";
import { userSettingsService } from "@/lib/userSettings";
import { INTELLIX_WA_TEMPLATES } from "@/lib/whatsapp-templates/intellix-wa-templates";

interface ApplyTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLeads: Lead[];
  onTemplateApplied: () => void;
}

interface FlatTemplate {
  id: string;
  name: string;
  segment: string;
  body: string;
  isPreset: boolean;
}

const CUSTOM_STORAGE_KEY = 'custom_templates_v2';

function buildTemplateList(): FlatTemplate[] {
  // 1. IntelliX presets (WhatsApp)
  const presets: FlatTemplate[] = INTELLIX_WA_TEMPLATES.map(t => ({
    id: t.id,
    name: t.name,
    segment: t.segment,
    body: t.body,
    isPreset: true,
  }));

  // 2. Custom WhatsApp templates from new storage
  const saved = localStorage.getItem(CUSTOM_STORAGE_KEY);
  let customs: FlatTemplate[] = [];
  if (saved) {
    try {
      const all = JSON.parse(saved) as Array<{
        id: string; name: string; channel: string; segment: string; body: string;
      }>;
      customs = all
        .filter(t => t.channel === 'whatsapp')
        .map(t => ({ id: t.id, name: t.name, segment: t.segment, body: t.body, isPreset: false }));
    } catch { /* ignore */ }
  }

  return [...presets, ...customs];
}

function replaceVars(body: string, lead: Lead, companyName: string): string {
  const nome = lead.contato || lead.empresa || '';
  const empresa = lead.empresa || '';
  return body
    .replace(/\{\{nome\}\}/g, nome)
    .replace(/\{\{empresa\}\}/g, empresa)
    .replace(/\{\{cidade\}\}/g, lead.cidade || '')
    .replace(/\{\{categoria\}\}/g, lead.categoria || '')
    // legacy vars kept for old custom templates
    .replace(/\{\{minha_empresa\}\}/g, companyName || 'IntelliX.AI')
    .replace(/\{\{contato\}\}/g, nome)
    .replace(/\{\{lead\}\}/g, lead.lead || '');
}

export function ApplyTemplateModal({
  isOpen,
  onClose,
  selectedLeads,
  onTemplateApplied,
}: ApplyTemplateModalProps) {
  const [templates, setTemplates] = useState<FlatTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<FlatTemplate | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [companyName, setCompanyName] = useState('IntelliX.AI');

  useEffect(() => {
    if (isOpen) {
      setTemplates(buildTemplateList());
      setSelectedTemplate(null);
      userSettingsService.getUserSettings().then(s => {
        if (s?.company_name) setCompanyName(s.company_name);
      }).catch(() => {});
    }
  }, [isOpen]);

  const handleApply = async () => {
    if (!selectedTemplate) {
      toast.error('Selecione um template');
      return;
    }
    if (selectedLeads.length === 0) {
      toast.error('Nenhum lead selecionado');
      return;
    }

    setIsApplying(true);
    try {
      await Promise.all(
        selectedLeads.map(lead =>
          supabaseCRM.updateLead(lead.id, {
            mensagemWhatsApp: replaceVars(selectedTemplate.body, lead, companyName),
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

  const previewLead = selectedLeads[0];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Aplicar Template aos Leads Selecionados
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">
                {selectedLeads.length} lead(s) selecionado(s)
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              A mensagem será personalizada com os dados de cada lead antes de salvar.
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
                          <Badge variant="outline" className="text-xs">{tpl.segment}</Badge>
                        </div>
                        {isSelected && <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />}
                      </div>

                      {/* Preview com primeiro lead selecionado */}
                      {previewLead && (
                        <div className="bg-muted p-3 rounded-lg">
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Preview para {previewLead.empresa || previewLead.lead}:
                          </p>
                          <p className="text-xs whitespace-pre-wrap leading-relaxed">
                            {replaceVars(tpl.body, previewLead, companyName)}
                          </p>
                        </div>
                      )}
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
            {isApplying ? 'Aplicando...' : `Aplicar aos ${selectedLeads.length} Lead(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
