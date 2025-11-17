import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Shuffle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Lead } from "@/types/prospection";
import { MessageTemplate, MessageVariation, MESSAGE_STYLES } from "@/types/prospection";
import { supabaseCRM } from "@/lib/supabaseCRM";
import { userSettingsService } from "@/lib/userSettings";

interface ApplyTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLeads: Lead[];
  onTemplateApplied: () => void;
}

export function ApplyTemplateModal({
  isOpen,
  onClose,
  selectedLeads,
  onTemplateApplied,
}: ApplyTemplateModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      loadUserSettings();
    }
  }, [isOpen]);

  const loadTemplates = () => {
    const saved = localStorage.getItem("whatsapp_templates");
    if (saved) {
      setTemplates(JSON.parse(saved));
    }
  };

  const loadUserSettings = async () => {
    try {
      const settings = await userSettingsService.getUserSettings();
      if (settings) {
        setCompanyName(settings.company_name || "");
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
    }
  };

  const getRandomVariation = (template: MessageTemplate): MessageVariation | string => {
    // Se template tem variations, escolher aleatoriamente
    if (template.variations && template.variations.length > 0) {
      const validVariations = template.variations.filter(v => v.message && v.message.trim() !== "");
      if (validVariations.length > 0) {
        const randomIndex = Math.floor(Math.random() * validVariations.length);
        return validVariations[randomIndex];
      }
    }

    // Fallback para template legado
    return template.message || "";
  };

  const replaceVariables = (message: string, lead: Lead): string => {
    return message
      .replace(/\{\{minha_empresa\}\}/g, companyName || "Sua Empresa")
      .replace(/\{\{empresa\}\}/g, lead.empresa || "Empresa")
      .replace(/\{\{categoria\}\}/g, lead.categoria || "")
      .replace(/\{\{cidade\}\}/g, lead.cidade || "")
      .replace(/\{\{contato\}\}/g, lead.contato || lead.empresa || "")
      .replace(/\{\{lead\}\}/g, lead.lead || "");
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplate) {
      toast.error("Selecione um template");
      return;
    }

    if (selectedLeads.length === 0) {
      toast.error("Nenhum lead selecionado");
      return;
    }

    setIsApplying(true);

    try {
      // Aplicar template a cada lead com variação aleatória
      const updates = selectedLeads.map(lead => {
        const variation = getRandomVariation(selectedTemplate);
        const messageTemplate = typeof variation === 'string' ? variation : variation.message;
        const personalizedMessage = replaceVariables(messageTemplate, lead);

        return supabaseCRM.updateLead(lead.id, {
          mensagemWhatsApp: personalizedMessage,
        });
      });

      await Promise.all(updates);

      toast.success(`Template aplicado a ${selectedLeads.length} lead(s)`, {
        description: "Mensagens personalizadas e prontas para envio!",
      });

      onTemplateApplied();
      onClose();
    } catch (error) {
      console.error("Erro ao aplicar template:", error);
      toast.error("Erro ao aplicar template aos leads");
    } finally {
      setIsApplying(false);
    }
  };

  const renderPreview = (lead: Lead, templateMessage: string) => {
    return replaceVariables(templateMessage, lead);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Aplicar Template aos Leads Selecionados
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Info sobre leads selecionados */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-medium text-blue-900">
                {selectedLeads.length} lead(s) selecionado(s)
              </p>
            </div>
            <p className="text-xs text-blue-700 mt-1">
              O template será aplicado com variações aleatórias para evitar mensagens idênticas
            </p>
          </div>

          {/* Lista de templates */}
          {templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum template disponível</p>
              <p className="text-sm mt-1">Crie templates no Gerenciador de Templates</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {templates.map((template) => {
                  const variations = template.variations || (template.message ? [{ style: 'formal' as const, message: template.message }] : []);
                  const validVariations = variations.filter(v => v.message && v.message.trim() !== "");
                  const isSelected = selectedTemplate?.id === template.id;

                  return (
                    <Card
                      key={template.id}
                      className={`p-4 cursor-pointer transition-all ${
                        isSelected
                          ? "border-primary border-2 bg-primary/5"
                          : "hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedTemplate(template)}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold">{template.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {template.category}
                              </Badge>
                              {validVariations.length > 1 && (
                                <Badge variant="default" className="text-xs gap-1">
                                  <Shuffle className="h-3 w-3" />
                                  {validVariations.length} variações
                                </Badge>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle className="h-5 w-5 text-primary" />
                          )}
                        </div>

                        {/* Preview com primeiro lead */}
                        {selectedLeads.length > 0 && validVariations.length > 0 && (
                          <div className="bg-muted p-3 rounded-lg">
                            <p className="text-xs font-medium mb-1">
                              Preview para {selectedLeads[0].lead}:
                            </p>
                            <p className="text-xs whitespace-pre-wrap">
                              {renderPreview(selectedLeads[0], validVariations[0].message)}
                            </p>
                          </div>
                        )}

                        {/* Estilos das variações */}
                        {validVariations.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {validVariations.map((variation, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {MESSAGE_STYLES[variation.style].emoji} {MESSAGE_STYLES[variation.style].label}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isApplying}>
            Cancelar
          </Button>
          <Button
            onClick={handleApplyTemplate}
            disabled={!selectedTemplate || isApplying || selectedLeads.length === 0}
          >
            {isApplying ? "Aplicando..." : `Aplicar aos ${selectedLeads.length} Lead(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
