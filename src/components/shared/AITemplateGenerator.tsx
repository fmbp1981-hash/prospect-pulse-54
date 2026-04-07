"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { MessageVariation, MESSAGE_STYLES } from "@/types/prospection";

interface AITemplateGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerated: (name: string, category: string, variations: MessageVariation[]) => void;
  presetType?: 'primeiro-contato-formal' | 'primeiro-contato-descontraido' | 'follow-up' | '';
}

const PRESET_CONFIGS = {
  'primeiro-contato-formal': {
    name: 'Primeiro Contato - Formal',
    category: 'Primeiro Contato',
    description: 'Mensagem de primeiro contato com tom profissional e formal para prospecção de clientes. Deve ser cordial, direto e demonstrar valor.',
    tone: 'profissional' as const,
  },
  'primeiro-contato-descontraido': {
    name: 'Primeiro Contato - Descontraído',
    category: 'Primeiro Contato',
    description: 'Mensagem de primeiro contato com tom leve e descontraído para prospecção de clientes. Usar linguagem amigável, emojis moderados e ser acessível.',
    tone: 'casual' as const,
  },
  'follow-up': {
    name: 'Follow-Up',
    category: 'Follow-up',
    description: 'Mensagem de follow-up para leads que já foram contatados anteriormente. Tom amigável, lembrando do contato anterior e oferecendo ajuda.',
    tone: 'misto' as const,
  },
};

export function AITemplateGenerator({
  isOpen,
  onClose,
  onGenerated,
  presetType = '',
}: AITemplateGeneratorProps) {
  const [businessContext, setBusinessContext] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVariations, setGeneratedVariations] = useState<MessageVariation[]>([]);
  const [generatedName, setGeneratedName] = useState("");

  // Reset when dialog opens with new preset
  useEffect(() => {
    if (isOpen) {
      setGeneratedVariations([]);
      setGeneratedName("");
    }
  }, [isOpen, presetType]);

  const currentPreset = presetType && PRESET_CONFIGS[presetType];

  const handleGenerate = async () => {
    if (!currentPreset) {
      toast.error("Tipo de template não selecionado");
      return;
    }

    setIsGenerating(true);

    try {
      // Chamar nossa Edge Function no Supabase
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Construir descrição completa
      let fullDescription = currentPreset.description;
      if (companyName.trim()) {
        fullDescription += ` A empresa que está prospectando se chama "${companyName}".`;
      }
      if (businessContext.trim()) {
        fullDescription += ` Contexto adicional: ${businessContext}`;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-template-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          description: fullDescription,
          category: currentPreset.category,
          tone: currentPreset.tone,
        }),
      });

      if (!response.ok) {
        throw new Error(`IA API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Erro ao gerar template');
      }

      const generatedText = data.generated_text || '';

      // Parse do texto gerado
      const variations = parseGeneratedText(generatedText);

      if (variations.length < 3) {
        throw new Error("IA não gerou variações suficientes");
      }

      setGeneratedVariations(variations);

      // Nome do template
      const templateName = companyName.trim() 
        ? `${currentPreset.name} - ${companyName}`
        : currentPreset.name;
      setGeneratedName(templateName);

      toast.success("Templates gerados com sucesso!", {
        description: "Revise e ajuste se necessário antes de salvar",
      });
    } catch (error) {
      console.error("Erro ao gerar templates:", error);
      toast.error("Erro ao gerar templates com IA", {
        description: "Tente novamente",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const parseGeneratedText = (text: string): MessageVariation[] => {
    const variations: MessageVariation[] = [];

    // Extrair variação 1 (formal)
    const var1Match = text.match(/VARIACAO_1:\s*(.+?)(?=VARIACAO_2:|$)/s);
    if (var1Match) {
      variations.push({
        style: 'formal',
        message: var1Match[1].trim(),
      });
    }

    // Extrair variação 2 (casual)
    const var2Match = text.match(/VARIACAO_2:\s*(.+?)(?=VARIACAO_3:|$)/s);
    if (var2Match) {
      variations.push({
        style: 'casual',
        message: var2Match[1].trim(),
      });
    }

    // Extrair variação 3 (direto)
    const var3Match = text.match(/VARIACAO_3:\s*(.+?)(?=NOME_TEMPLATE:|$)/s);
    if (var3Match) {
      variations.push({
        style: 'direto',
        message: var3Match[1].trim(),
      });
    }

    return variations;
  };

  const handleUseTemplate = () => {
    if (generatedVariations.length === 0) {
      toast.error("Gere um template primeiro");
      return;
    }

    const category = currentPreset?.category || "Primeiro Contato";
    onGenerated(generatedName, category, generatedVariations);
    handleClose();
  };

  const handleClose = () => {
    setBusinessContext("");
    setCompanyName("");
    setGeneratedVariations([]);
    setGeneratedName("");
    onClose();
  };

  const renderPreview = (message: string) => {
    return message
      .replace(/\{\{minha_empresa\}\}/g, "Sua Empresa")
      .replace(/\{\{empresa\}\}/g, "Exemplo Empresa Ltda")
      .replace(/\{\{categoria\}\}/g, "Restaurantes")
      .replace(/\{\{cidade\}\}/g, "São Paulo")
      .replace(/\{\{contato\}\}/g, "João Silva")
      .replace(/\{\{lead\}\}/g, "Lead-001");
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Gerar Template com IA - {currentPreset?.name || 'Personalizado'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {generatedVariations.length === 0 ? (
            <>
              {/* Formulário de Input */}
              <div className="space-y-4">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-purple-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-purple-900">
                        {currentPreset?.name || 'Template Personalizado'}
                      </p>
                      <p className="text-xs text-purple-700 mt-1">
                        A IA criará automaticamente 3 variações com estilos diferentes 
                        (Formal, Casual e Direto). Você poderá revisar e editar antes de salvar.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyName">Nome da sua empresa (opcional)</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex: Minha Empresa Ltda"
                  />
                  <p className="text-xs text-muted-foreground">
                    A IA incluirá o nome da sua empresa nas mensagens
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="businessContext">Contexto adicional (opcional)</Label>
                  <Textarea
                    id="businessContext"
                    value={businessContext}
                    onChange={(e) => setBusinessContext(e.target.value)}
                    placeholder="Ex: Oferecemos soluções de pagamento para pequenos negócios. Nosso diferencial é o atendimento personalizado..."
                    rows={4}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Descreva seu negócio, produto ou serviço para mensagens mais personalizadas
                  </p>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-yellow-900 mb-2">
                    ⚡ Variáveis que serão usadas automaticamente:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <code className="text-xs bg-yellow-100 px-2 py-0.5 rounded">
                      {"{{minha_empresa}}"}
                    </code>
                    <code className="text-xs bg-yellow-100 px-2 py-0.5 rounded">
                      {"{{empresa}}"}
                    </code>
                    <code className="text-xs bg-yellow-100 px-2 py-0.5 rounded">
                      {"{{categoria}}"}
                    </code>
                    <code className="text-xs bg-yellow-100 px-2 py-0.5 rounded">
                      {"{{cidade}}"}
                    </code>
                    <code className="text-xs bg-yellow-100 px-2 py-0.5 rounded">
                      {"{{contato}}"}
                    </code>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Preview das Variações Geradas */}
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-900">
                        ✨ Template Gerado: {generatedName}
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        3 variações criadas automaticamente. Revise abaixo e clique em &quot;Usar Template&quot;
                        para editar no Template Manager antes de salvar.
                      </p>
                    </div>
                  </div>
                </div>

                {generatedVariations.map((variation, index) => (
                  <Card key={index} className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="default">
                        {MESSAGE_STYLES[variation.style].emoji} Variação {index + 1}: {MESSAGE_STYLES[variation.style].label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {MESSAGE_STYLES[variation.style].description}
                      </span>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium mb-2">Template:</p>
                        <div className="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {variation.message}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium mb-2">Preview:</p>
                        <div className="bg-blue-50 border border-blue-200 p-3 rounded text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {renderPreview(variation.message)}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {generatedVariations.length === 0 ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!currentPreset || isGenerating}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando com IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Gerar Template
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setGeneratedVariations([]);
                  setGeneratedName("");
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Gerar Novamente
              </Button>
              <Button onClick={handleUseTemplate} className="bg-green-600 hover:bg-green-700">
                Usar Template
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
