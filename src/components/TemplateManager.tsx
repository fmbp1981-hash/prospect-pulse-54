import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Plus, Edit2, Trash2, Star, Copy, Shuffle, Sparkles, RefreshCw, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { MessageTemplate, MessageVariation, MessageStyle, MESSAGE_STYLES, TEMPLATE_VARIABLES } from "@/types/prospection";
import { AITemplateGenerator } from "./AITemplateGenerator";

interface TemplateManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

// Template XPAG - template padrão que não pode ser removido
const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: "xpag-prospeccao-ativa",
    name: "Msg de Prospecção Ativa Xpag",
    category: "Primeiro Contato",
    variations: [
      {
        style: 'formal',
        message: `Olá! 👋

Aqui é da XPAG, empresa especializada em soluções de pagamento para negócios como o seu.
Vi que vocês atuam como {{categoria}} em {{cidade}} e achei que poderia ser interessante apresentar a XPAG.
Caso faça sentido, posso te conectar com um consultor XPAG para explicar como podemos apoiar o crescimento do seu negócio. 😊`
      },
      {
        style: 'casual',
        message: `Oi! 😊

Sou da XPAG, e percebi que vocês são {{categoria}} aí em {{cidade}}.
Trabalhamos com soluções de pagamento e posso ajudar seu negócio a crescer!
Se quiser conhecer um pouco mais, posso te colocar em contato com um consultor XPAG.`
      },
      {
        style: 'direto',
        message: `Olá!

Sou da XPAG, e vi que vocês atuam como {{categoria}} em {{cidade}}.
Temos soluções de pagamento que podem ajudar seu negócio.
Posso pedir para um consultor XPAG te enviar mais informações?`
      }
    ],
    isDefault: true,
    createdAt: new Date().toISOString(),
  },
];

const TEMPLATE_CATEGORIES = [
  "Primeiro Contato",
  "Follow-up",
  "Proposta",
  "Negociação",
  "Pós-venda",
  "Personalizado",
];

export function TemplateManager({ isOpen, onClose }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<MessageTemplate | null>(null);
  const [activeVariationTab, setActiveVariationTab] = useState("0");
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
  const [aiGeneratorMode, setAIGeneratorMode] = useState<'from-scratch' | 'variations'>('from-scratch');
  const [baseTemplateForVariations, setBaseTemplateForVariations] = useState<string>("");
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category: "Primeiro Contato",
    variations: [
      { style: 'formal' as MessageStyle, message: "" },
      { style: 'casual' as MessageStyle, message: "" },
      { style: 'direto' as MessageStyle, message: "" },
    ] as MessageVariation[],
  });

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = () => {
    const saved = localStorage.getItem("whatsapp_templates");
    if (saved) {
      setTemplates(JSON.parse(saved));
    } else {
      // Carregar templates padrão na primeira vez
      setTemplates(DEFAULT_TEMPLATES);
      localStorage.setItem("whatsapp_templates", JSON.stringify(DEFAULT_TEMPLATES));
    }
  };

  const saveTemplates = (newTemplates: MessageTemplate[]) => {
    localStorage.setItem("whatsapp_templates", JSON.stringify(newTemplates));
    setTemplates(newTemplates);
  };

  const handleCreate = () => {
    setIsEditing(true);
    setCurrentTemplate(null);
    setActiveVariationTab("0");
    setFormData({
      name: "",
      category: "Primeiro Contato",
      variations: [
        { style: 'formal', message: "" },
        { style: 'casual', message: "" },
        { style: 'direto', message: "" },
      ],
    });
  };

  const handleEdit = (template: MessageTemplate) => {
    if (template.isDefault) {
      toast.error("Templates padrão não podem ser editados", {
        description: "Crie uma cópia para personalizar",
      });
      return;
    }
    setIsEditing(true);
    setCurrentTemplate(template);
    setActiveVariationTab("0");

    // Migrar template legado (com message) para novo formato (com variations)
    const variations = template.variations || [
      { style: 'formal' as MessageStyle, message: template.message || "" },
      { style: 'casual' as MessageStyle, message: "" },
      { style: 'direto' as MessageStyle, message: "" },
    ];

    setFormData({
      name: template.name,
      category: template.category,
      variations,
    });
  };

  const handleDuplicate = (template: MessageTemplate) => {
    setIsEditing(true);
    setCurrentTemplate(null);
    setActiveVariationTab("0");

    // Migrar template legado se necessário
    const variations = template.variations || [
      { style: 'formal' as MessageStyle, message: template.message || "" },
      { style: 'casual' as MessageStyle, message: "" },
      { style: 'direto' as MessageStyle, message: "" },
    ];

    setFormData({
      name: `${template.name} (Cópia)`,
      category: template.category,
      variations,
    });
  };

  const handleDelete = (id: string) => {
    const template = templates.find((t) => t.id === id);
    if (template?.isDefault) {
      toast.error("Templates padrão não podem ser deletados");
      return;
    }

    const newTemplates = templates.filter((t) => t.id !== id);
    saveTemplates(newTemplates);
    toast.success("Template deletado com sucesso");
  };

  const handleResetTemplates = () => {
    if (confirm("Tem certeza que deseja limpar todos os templates e restaurar os padrões? Esta ação não pode ser desfeita.")) {
      localStorage.removeItem("whatsapp_templates");
      setTemplates(DEFAULT_TEMPLATES);
      localStorage.setItem("whatsapp_templates", JSON.stringify(DEFAULT_TEMPLATES));
      toast.success("Templates resetados com sucesso!", {
        description: "Templates padrão restaurados",
      });
    }
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error("Digite um nome para o template");
      return;
    }

    // Validar que pelo menos uma variação tem mensagem
    const hasAtLeastOneMessage = formData.variations.some(v => v.message.trim() !== "");
    if (!hasAtLeastOneMessage) {
      toast.error("Preencha pelo menos uma variação de mensagem");
      return;
    }

    if (currentTemplate) {
      // Editar existente
      const newTemplates = templates.map((t) =>
        t.id === currentTemplate.id
          ? {
            ...t,
            name: formData.name,
            category: formData.category,
            variations: formData.variations,
            updatedAt: new Date().toISOString(),
          }
          : t
      );
      saveTemplates(newTemplates);
      toast.success("Template atualizado com sucesso");
    } else {
      // Criar novo
      const newTemplate: MessageTemplate = {
        id: `custom-${Date.now()}`,
        name: formData.name,
        category: formData.category,
        variations: formData.variations,
        isDefault: false,
        createdAt: new Date().toISOString(),
      };
      saveTemplates([...templates, newTemplate]);
      toast.success("Template criado com sucesso");
    }

    setIsEditing(false);
    setCurrentTemplate(null);
  };

  const updateVariation = (index: number, field: 'style' | 'message', value: string) => {
    const newVariations = [...formData.variations];
    if (field === 'style') {
      newVariations[index].style = value as MessageStyle;
    } else {
      newVariations[index].message = value;
    }
    setFormData({ ...formData, variations: newVariations });
  };

  const handleAIGenerated = (name: string, category: string, variations: MessageVariation[]) => {
    // Preencher formulário com dados gerados pela IA
    setFormData({
      name,
      category,
      variations,
    });
    setIsEditing(true);
    setActiveVariationTab("0");
    toast.success("Template carregado!", {
      description: "Revise e ajuste antes de salvar",
    });
  };

  // Gerar variações a partir de um template existente usando IA
  const handleGenerateVariationsFromTemplate = async () => {
    const baseMessage = formData.variations[0]?.message;
    if (!baseMessage || baseMessage.trim().length < 20) {
      toast.error("Digite pelo menos a primeira variação do template", {
        description: "A IA usará como base para gerar as demais variações",
      });
      return;
    }

    setIsGeneratingVariations(true);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-template-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          description: `Gere 2 variações a partir desta mensagem base (mantendo o mesmo significado mas com estilos diferentes - casual e direto): "${baseMessage}"`,
          category: formData.category,
          tone: 'misto',
          baseMessage: baseMessage,
          generateVariationsOnly: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`IA API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Erro ao gerar variações');
      }

      const generatedText = data.generated_text || '';

      // Parse das variações geradas
      const var2Match = generatedText.match(/VARIACAO_2:\s*(.+?)(?=VARIACAO_3:|$)/s);
      const var3Match = generatedText.match(/VARIACAO_3:\s*(.+?)(?=NOME_TEMPLATE:|$)/s);

      const newVariations = [...formData.variations];
      if (var2Match) {
        newVariations[1] = { style: 'casual', message: var2Match[1].trim() };
      }
      if (var3Match) {
        newVariations[2] = { style: 'direto', message: var3Match[1].trim() };
      }

      setFormData({ ...formData, variations: newVariations });

      toast.success("Variações geradas com sucesso!", {
        description: "Revise as variações 2 e 3 antes de salvar",
      });
    } catch (error) {
      console.error("Erro ao gerar variações:", error);
      toast.error("Erro ao gerar variações com IA", {
        description: "Tente novamente ou crie manualmente",
      });
    } finally {
      setIsGeneratingVariations(false);
    }
  };

  const openAIGenerator = (mode: 'from-scratch' | 'variations') => {
    setAIGeneratorMode(mode);
    setIsAIGeneratorOpen(true);
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Gerenciar Templates de Mensagens
          </DialogTitle>
        </DialogHeader>

        {!isEditing ? (
          <>
            {/* Lista de Templates */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {templates.length} template(s) disponíveis
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={handleCreate} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Template
                    </Button>
                  </div>
                </div>

                {/* Opções de Geração com IA */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-600" />
                    <p className="text-sm font-medium text-purple-900">Gerar Template com IA</p>
                  </div>
                  <p className="text-xs text-purple-700">
                    Deixe a IA criar templates profissionais para você
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Button
                      onClick={() => {
                        setAIGeneratorMode('from-scratch');
                        setBaseTemplateForVariations('primeiro-contato-formal');
                        setIsAIGeneratorOpen(true);
                      }}
                      size="sm"
                      variant="outline"
                      className="border-purple-200 text-purple-600 hover:bg-purple-100 justify-start"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Primeiro Contato Formal
                    </Button>
                    <Button
                      onClick={() => {
                        setAIGeneratorMode('from-scratch');
                        setBaseTemplateForVariations('primeiro-contato-descontraido');
                        setIsAIGeneratorOpen(true);
                      }}
                      size="sm"
                      variant="outline"
                      className="border-purple-200 text-purple-600 hover:bg-purple-100 justify-start"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Primeiro Contato Descontraído
                    </Button>
                    <Button
                      onClick={() => {
                        setAIGeneratorMode('from-scratch');
                        setBaseTemplateForVariations('follow-up');
                        setIsAIGeneratorOpen(true);
                      }}
                      size="sm"
                      variant="outline"
                      className="border-purple-200 text-purple-600 hover:bg-purple-100 justify-start"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Follow-Up
                    </Button>
                  </div>
                </div>

                {templates.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p className="text-sm">Nenhum template ainda</p>
                    <p className="text-xs">Crie um template manualmente ou use a IA para gerar</p>
                  </div>
                )}

                {templates.map((template) => {
                  const variations = template.variations || (template.message ? [{ style: 'formal' as MessageStyle, message: template.message }] : []);
                  const validVariations = variations.filter(v => v.message && v.message.trim() !== "");

                  return (
                    <Card key={template.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{template.name}</h4>
                            {template.isDefault && (
                              <Badge variant="secondary" className="gap-1">
                                <Star className="h-3 w-3" />
                                Padrão
                              </Badge>
                            )}
                            <Badge variant="outline">{template.category}</Badge>
                            {validVariations.length > 1 && (
                              <Badge variant="default" className="gap-1">
                                <Shuffle className="h-3 w-3" />
                                {validVariations.length} variações
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Criado em {new Date(template.createdAt).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDuplicate(template)}
                            title="Duplicar"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(template)}
                            disabled={template.isDefault}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(template.id)}
                            disabled={template.isDefault}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                    <Separator />

                    {/* Mostrar variações */}
                    <div className="space-y-2">
                      {validVariations.map((variation, index) => (
                        <div key={index} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {MESSAGE_STYLES[variation.style].emoji} {MESSAGE_STYLES[variation.style].label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {MESSAGE_STYLES[variation.style].description}
                            </span>
                          </div>
                          <div className="bg-muted p-2 rounded text-xs whitespace-pre-wrap max-h-20 overflow-y-auto">
                            {variation.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Formulário de Edição */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Template</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Primeiro Contato - Profissional"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Tabs para as 3 variações */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Shuffle className="h-4 w-4" />
                      <Label>Variações de Mensagem (Envio Aleatório)</Label>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateVariationsFromTemplate}
                      disabled={isGeneratingVariations || !formData.variations[0]?.message}
                      className="border-purple-200 text-purple-600 hover:bg-purple-50"
                    >
                      {isGeneratingVariations ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-4 w-4 mr-2" />
                          Gerar Variações com IA
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Escreva a primeira variação e use a IA para gerar as demais automaticamente, ou configure manualmente.
                  </p>

                  <Tabs value={activeVariationTab} onValueChange={setActiveVariationTab}>
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="0">
                        Variação 1 {formData.variations[0]?.message && "✓"}
                      </TabsTrigger>
                      <TabsTrigger value="1">
                        Variação 2 {formData.variations[1]?.message && "✓"}
                      </TabsTrigger>
                      <TabsTrigger value="2">
                        Variação 3 {formData.variations[2]?.message && "✓"}
                      </TabsTrigger>
                    </TabsList>

                    {[0, 1, 2].map((index) => (
                      <TabsContent key={index} value={String(index)} className="space-y-3 mt-3">
                        <div className="space-y-2">
                          <Label>Estilo da Mensagem</Label>
                          <Select
                            value={formData.variations[index]?.style || 'formal'}
                            onValueChange={(value) => updateVariation(index, 'style', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(MESSAGE_STYLES).map(([key, style]) => (
                                <SelectItem key={key} value={key}>
                                  <span className="flex items-center gap-2">
                                    {style.emoji} {style.label} - {style.description}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Mensagem</Label>
                          <Textarea
                            value={formData.variations[index]?.message || ""}
                            onChange={(e) => updateVariation(index, 'message', e.target.value)}
                            placeholder={`Digite a variação ${index + 1} da mensagem... (opcional)`}
                            rows={8}
                            className="font-mono text-sm"
                          />
                          <p className="text-xs text-muted-foreground">
                            Use: {TEMPLATE_VARIABLES.map((v) => v.key).join(", ")}
                          </p>
                        </div>

                        {formData.variations[index]?.message && (
                          <div className="space-y-2">
                            <Label>Preview:</Label>
                            <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                              <p className="text-sm whitespace-pre-wrap">
                                {renderPreview(formData.variations[index].message)}
                              </p>
                            </div>
                          </div>
                        )}
                      </TabsContent>
                    ))}
                  </Tabs>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-blue-900">💡 Dica: Variações Aleatórias</p>
                  <p className="text-xs text-blue-800">
                    Ao enviar para múltiplos leads, o sistema escolherá automaticamente uma das variações
                    preenchidas de forma aleatória. Isso torna as mensagens mais naturais e evita bloqueios.
                  </p>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-yellow-900">⚙️ Variáveis Disponíveis:</p>
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    {TEMPLATE_VARIABLES.map((variable) => (
                      <div key={variable.key} className="flex items-start gap-1">
                        <code className="text-xs bg-yellow-100 px-1.5 py-0.5 rounded">
                          {variable.key}
                        </code>
                        <span className="text-xs text-yellow-800">{variable.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setCurrentTemplate(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {currentTemplate ? "Salvar Alterações" : "Criar Template"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>

      {/* AI Template Generator Modal */}
      <AITemplateGenerator
        isOpen={isAIGeneratorOpen}
        onClose={() => {
          setIsAIGeneratorOpen(false);
          setBaseTemplateForVariations("");
        }}
        onGenerated={handleAIGenerated}
        presetType={baseTemplateForVariations as 'primeiro-contato-formal' | 'primeiro-contato-descontraido' | 'follow-up' | ''}
      />
    </Dialog>
  );
}
