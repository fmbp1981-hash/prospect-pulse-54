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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare, Plus, Edit2, Trash2, Copy, Sparkles, Loader2,
  Mail, Star, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { INTELLIX_WA_TEMPLATES, type WaTemplate } from "@/lib/whatsapp-templates/intellix-wa-templates";
import { INTELLIX_EMAIL_TEMPLATES, type EmailTemplate } from "@/lib/email-templates/intellix-email-templates";

interface TemplateManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CustomTemplate {
  id: string;
  name: string;
  channel: 'whatsapp' | 'email';
  segment: string;
  subject?: string;
  body: string;
  createdAt: string;
}

const STORAGE_KEY = 'custom_templates_v2';

function getCategoryTemplateId(categoria: string, channel: 'whatsapp' | 'email'): string {
  const cat = categoria.toLowerCase();
  let segId: string;
  if (/constru|im[oó]vel|imobiliar/.test(cat)) {
    segId = 'construcao_v1';
  } else if (/jur[ií]d|advocac|direito/.test(cat)) {
    segId = 'juridico_v1';
  } else if (/sa[úu]de|cl[ií]nica|odonto|labor/.test(cat)) {
    segId = 'saude_v1';
  } else if (/atacado|distribu|food/.test(cat)) {
    segId = 'atacado_v1';
  } else if (/tecnolog|ti|telecom/.test(cat)) {
    segId = 'tech_v1';
  } else if (/marketi|ag[eê]nci|publicid/.test(cat)) {
    segId = 'agencia_v1';
  } else if (/consultor|financei|seguro|cons[oó]rc/.test(cat)) {
    segId = 'financeiro_v1';
  } else if (/solar|energia/.test(cat)) {
    segId = 'energiasolar_v1';
  } else {
    segId = 'universal_v1';
  }
  return channel === 'whatsapp' ? `intellix_er_${segId}` : `intellix_email_${segId}`;
}

function stripHtml(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function TemplateManager({ isOpen, onClose }: TemplateManagerProps) {
  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [isEditing, setIsEditing] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<CustomTemplate | null>(null);

  // Form for create/edit
  const [formData, setFormData] = useState({
    name: '',
    channel: 'whatsapp' as 'whatsapp' | 'email',
    segment: '',
    subject: '',
    body: '',
  });

  // Category match + AI personalization
  const [matchEmpresa, setMatchEmpresa] = useState('');
  const [matchNome, setMatchNome] = useState('');
  const [matchCategoria, setMatchCategoria] = useState('');
  const [matchCidade, setMatchCidade] = useState('');
  const [personalizedBody, setPersonalizedBody] = useState<string | null>(null);
  const [isPersonalizing, setIsPersonalizing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          setCustomTemplates(JSON.parse(saved));
        } catch {
          setCustomTemplates([]);
        }
      }
    }
  }, [isOpen]);

  const saveCustomTemplates = (templates: CustomTemplate[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    setCustomTemplates(templates);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado para a área de transferência!');
    } catch {
      toast.error('Falha ao copiar');
    }
  };

  const handleDeleteCustom = (id: string) => {
    if (!confirm('Excluir este template?')) return;
    saveCustomTemplates(customTemplates.filter(t => t.id !== id));
    toast.success('Template excluído');
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormData({ name: '', channel: activeChannel, segment: '', subject: '', body: '' });
    setIsEditing(true);
  };

  const handleEditCustom = (tpl: CustomTemplate) => {
    setEditingTemplate(tpl);
    setFormData({
      name: tpl.name,
      channel: tpl.channel,
      segment: tpl.segment,
      subject: tpl.subject || '',
      body: tpl.body,
    });
    setIsEditing(true);
  };

  // "Editar/personalizar" um preset IntelliX abre o formulário criando uma cópia editável
  const handleEditPreset = (tpl: WaTemplate | EmailTemplate) => {
    setEditingTemplate(null);
    setFormData({
      name: `${tpl.name} (cópia)`,
      channel: activeChannel,
      segment: tpl.segment,
      subject: activeChannel === 'email' ? (tpl as EmailTemplate).subject || '' : '',
      body: tpl.body,
    });
    setIsEditing(true);
  };

  const handleSaveTemplate = () => {
    if (!formData.name.trim()) {
      toast.error('Digite um nome para o template');
      return;
    }
    if (!formData.body.trim()) {
      toast.error('O corpo da mensagem não pode estar vazio');
      return;
    }

    if (editingTemplate) {
      const updated = customTemplates.map(t =>
        t.id === editingTemplate.id
          ? { ...t, ...formData, subject: formData.channel === 'email' ? formData.subject : undefined }
          : t
      );
      saveCustomTemplates(updated);
      toast.success('Template atualizado');
    } else {
      const newTpl: CustomTemplate = {
        id: `custom-${Date.now()}`,
        name: formData.name,
        channel: formData.channel,
        segment: formData.segment,
        subject: formData.channel === 'email' ? formData.subject : undefined,
        body: formData.body,
        createdAt: new Date().toISOString(),
      };
      saveCustomTemplates([...customTemplates, newTpl]);
      toast.success('Template criado');
    }
    setIsEditing(false);
    setEditingTemplate(null);
  };

  const handlePersonalizeWithAI = async () => {
    if (!matchEmpresa.trim()) {
      toast.error('Informe o nome da empresa');
      return;
    }

    const templateId = getCategoryTemplateId(matchCategoria, activeChannel);
    const presetList = activeChannel === 'whatsapp' ? INTELLIX_WA_TEMPLATES : INTELLIX_EMAIL_TEMPLATES;
    const preset = presetList.find(t => t.id === templateId) || presetList[0];

    setIsPersonalizing(true);
    setPersonalizedBody(null);

    try {
      const res = await fetch('/api/templates/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateBody: preset.body,
          channel: activeChannel,
          lead: {
            empresa: matchEmpresa,
            nome: matchNome || undefined,
            categoria: matchCategoria || undefined,
            cidade: matchCidade || undefined,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao personalizar');
      }
      setPersonalizedBody(data.personalizedBody);
      toast.success('Mensagem personalizada com IA!', {
        description: `Template base: ${preset.name}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Erro ao personalizar', { description: message });
    } finally {
      setIsPersonalizing(false);
    }
  };

  const presets = activeChannel === 'whatsapp' ? INTELLIX_WA_TEMPLATES : INTELLIX_EMAIL_TEMPLATES;
  const channelCustomTemplates = customTemplates.filter(t => t.channel === activeChannel);
  const totalCount = presets.length + channelCustomTemplates.length;

  // ---- Edit/Create form view ----
  if (isEditing) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {editingTemplate ? 'Editar Template' : 'Novo Template'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do template</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Prospecção Clínicas"
                />
              </div>
              <div className="space-y-2">
                <Label>Canal</Label>
                <Select
                  value={formData.channel}
                  onValueChange={v => setFormData({ ...formData, channel: v as 'whatsapp' | 'email' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Segmento</Label>
              <Input
                value={formData.segment}
                onChange={e => setFormData({ ...formData, segment: e.target.value })}
                placeholder="Ex: Clínicas odontológicas"
              />
            </div>

            {formData.channel === 'email' && (
              <div className="space-y-2">
                <Label>Assunto</Label>
                <Input
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Ex: Automatize sua clínica com IA"
                />
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <Label>Corpo da mensagem</Label>
              <Textarea
                value={formData.body}
                onChange={e => setFormData({ ...formData, body: e.target.value })}
                placeholder={formData.channel === 'email'
                  ? 'HTML ou texto do email...'
                  : 'Mensagem WhatsApp. Use {{nome}} e {{empresa}}...'}
                rows={formData.channel === 'email' ? 14 : 10}
                className="font-mono text-sm"
              />
            </div>

            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
              <p className="text-xs font-medium text-foreground">⚙️ Variáveis disponíveis:</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {['{{nome}}', '{{empresa}}', '{{cidade}}', '{{categoria}}'].map(v => (
                  <code key={v} className="text-xs bg-warning/20 text-foreground px-1.5 py-0.5 rounded font-mono">
                    {v}
                  </code>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditing(false); setEditingTemplate(null); }}>
              Cancelar
            </Button>
            <Button onClick={handleSaveTemplate}>
              {editingTemplate ? 'Salvar alterações' : 'Criar template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ---- List view ----
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Gerenciar Templates de Mensagens
          </DialogTitle>
        </DialogHeader>

        {/* Channel tabs */}
        <Tabs value={activeChannel} onValueChange={v => {
          setActiveChannel(v as 'whatsapp' | 'email');
          setPersonalizedBody(null);
        }}>
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

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* AI personalization box (match por categoria) */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium text-foreground">Personalizar com IA por Categoria</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Preencha os dados do lead. O sistema escolhe o template do segmento certo e personaliza a mensagem com IA.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Empresa *</Label>
                <Input
                  value={matchEmpresa}
                  onChange={e => setMatchEmpresa(e.target.value)}
                  placeholder="Nome da empresa"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nome do contato</Label>
                <Input
                  value={matchNome}
                  onChange={e => setMatchNome(e.target.value)}
                  placeholder="Nome da pessoa"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Categoria / Segmento</Label>
                <Input
                  value={matchCategoria}
                  onChange={e => setMatchCategoria(e.target.value)}
                  placeholder="Ex: Clínica odontológica"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cidade</Label>
                <Input
                  value={matchCidade}
                  onChange={e => setMatchCidade(e.target.value)}
                  placeholder="Ex: Recife"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <Button
              onClick={handlePersonalizeWithAI}
              disabled={isPersonalizing || !matchEmpresa.trim()}
              size="sm"
              className="gap-2 w-full sm:w-auto"
            >
              {isPersonalizing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Personalizando...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Personalizar com IA
                </>
              )}
            </Button>

            {personalizedBody && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Mensagem personalizada</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(personalizedBody)}
                    className="gap-1 text-xs h-7"
                  >
                    <Copy className="h-3 w-3" />
                    Copiar
                  </Button>
                </div>
                {activeChannel === 'email' ? (
                  <div className="rounded border overflow-hidden bg-white">
                    <iframe
                      srcDoc={personalizedBody}
                      className="w-full h-64 border-0"
                      title="Preview personalizado"
                      sandbox="allow-same-origin"
                    />
                  </div>
                ) : (
                  <Textarea
                    value={personalizedBody}
                    onChange={e => setPersonalizedBody(e.target.value)}
                    rows={6}
                    className="text-sm"
                  />
                )}
              </div>
            )}
          </div>

          {/* Header row */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {totalCount} template(s) — {activeChannel === 'whatsapp' ? 'WhatsApp' : 'Email'}
            </p>
            <Button onClick={handleCreate} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Template
            </Button>
          </div>

          {/* IntelliX presets */}
          {presets.map(tpl => {
            const preview = activeChannel === 'email'
              ? stripHtml(tpl.body)
              : tpl.body;
            return (
              <Card key={tpl.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-semibold">{tpl.name}</h4>
                      <Badge variant="secondary" className="gap-1">
                        <Star className="h-3 w-3" />
                        IntelliX
                      </Badge>
                      <Badge variant="outline">{tpl.segment}</Badge>
                    </div>
                    {activeChannel === 'email' && (
                      <p className="text-xs text-muted-foreground">
                        Assunto: {(tpl as EmailTemplate).subject}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => handleCopy(tpl.body)} title="Copiar">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEditPreset(tpl)} title="Personalizar / criar cópia editável">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-28 overflow-y-auto leading-relaxed">
                  {preview}
                </div>
              </Card>
            );
          })}

          {/* Custom templates */}
          {channelCustomTemplates.length > 0 && (
            <>
              <Separator />
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <span>📁</span> Meus templates
              </p>
            </>
          )}
          {channelCustomTemplates.map(tpl => {
            const preview = tpl.channel === 'email' ? stripHtml(tpl.body) : tpl.body;
            return (
              <Card key={tpl.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-semibold">{tpl.name}</h4>
                      {tpl.segment && <Badge variant="outline">{tpl.segment}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Criado em {new Date(tpl.createdAt).toLocaleDateString('pt-BR')}
                      {tpl.channel === 'email' && tpl.subject ? ` · Assunto: ${tpl.subject}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => handleCopy(tpl.body)} title="Copiar">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEditCustom(tpl)} title="Editar">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteCustom(tpl.id)}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-28 overflow-y-auto leading-relaxed">
                  {preview}
                </div>
              </Card>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
