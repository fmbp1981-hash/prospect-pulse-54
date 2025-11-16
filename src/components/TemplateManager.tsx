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
import { MessageSquare, Plus, Edit2, Trash2, Star, Copy } from "lucide-react";
import { toast } from "sonner";
import { MessageTemplate, TEMPLATE_VARIABLES } from "@/types/prospection";

interface TemplateManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: "default-1",
    name: "Primeiro Contato - Formal",
    category: "Primeiro Contato",
    message: `Olá! 👋

Estou entrando em contato com a {{empresa}} em {{cidade}} porque identificamos oportunidades interessantes para o seu negócio de {{categoria}}.

Podemos agendar uma conversa rápida para apresentar nossa solução?

Aguardo seu retorno!`,
    isDefault: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "default-2",
    name: "Primeiro Contato - Casual",
    category: "Primeiro Contato",
    message: `E aí! 😊

Vi a {{empresa}} em {{cidade}} e achei super interessante o trabalho de vocês com {{categoria}}.

Tenho algo que pode ajudar muito vocês - bora conversar?`,
    isDefault: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "default-3",
    name: "Follow-up",
    category: "Follow-up",
    message: `Olá novamente!

Enviei uma mensagem semana passada sobre a {{empresa}}.

Conseguiu dar uma olhada? Seria ótimo conversar sobre como podemos ajudar vocês!`,
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
  const [formData, setFormData] = useState({
    name: "",
    category: "Primeiro Contato",
    message: "",
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
    setFormData({
      name: "",
      category: "Primeiro Contato",
      message: "",
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
    setFormData({
      name: template.name,
      category: template.category,
      message: template.message,
    });
  };

  const handleDuplicate = (template: MessageTemplate) => {
    setIsEditing(true);
    setCurrentTemplate(null);
    setFormData({
      name: `${template.name} (Cópia)`,
      category: template.category,
      message: template.message,
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

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error("Digite um nome para o template");
      return;
    }
    if (!formData.message.trim()) {
      toast.error("Digite a mensagem do template");
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
              message: formData.message,
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
        message: formData.message,
        isDefault: false,
        createdAt: new Date().toISOString(),
      };
      saveTemplates([...templates, newTemplate]);
      toast.success("Template criado com sucesso");
    }

    setIsEditing(false);
    setCurrentTemplate(null);
  };

  const renderPreview = (message: string) => {
    return message
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
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {templates.length} template(s) disponíveis
                </p>
                <Button onClick={handleCreate} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Template
                </Button>
              </div>

              {templates.map((template) => (
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

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium mb-2">Template:</p>
                      <div className="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {template.message}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-2">Preview:</p>
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {renderPreview(template.message)}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
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
                    placeholder="Ex: Primeiro Contato - Formal"
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

                <div className="space-y-2">
                  <Label htmlFor="message">Mensagem</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Digite a mensagem do template..."
                    rows={8}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use variáveis para personalizar: {TEMPLATE_VARIABLES.map((v) => v.key).join(", ")}
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-medium text-blue-900">Variáveis Disponíveis:</p>
                  <div className="space-y-1">
                    {TEMPLATE_VARIABLES.map((variable) => (
                      <div key={variable.key} className="flex items-start gap-2">
                        <code className="text-xs bg-blue-100 px-2 py-1 rounded">
                          {variable.key}
                        </code>
                        <span className="text-xs text-blue-800">{variable.description}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {formData.message && (
                  <div className="space-y-2">
                    <Label>Preview da Mensagem:</Label>
                    <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">{renderPreview(formData.message)}</p>
                    </div>
                  </div>
                )}
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
    </Dialog>
  );
}
