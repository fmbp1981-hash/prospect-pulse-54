import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare, Plus, Edit2, Trash2, Copy, Sparkles, Loader2,
  Mail, CheckCircle2, ArrowLeft
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

export function TemplateManager({ isOpen, onClose }: TemplateManagerProps) {
  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [view, setView] = useState<'list' | 'edit' | 'create' | 'preview'>('list');
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<WaTemplate | EmailTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<CustomTemplate | null>(null);

  // Form for create/edit
  const [formData, setFormData] = useState({
    name: '',
    channel: 'whatsapp' as 'whatsapp' | 'email',
    segment: '',
    subject: '',
    body: '',
  });

  // Category match section
  const [matchEmpresa, setMatchEmpresa] = useState('');
  const [matchNome, setMatchNome] = useState('');
  const [matchCategoria, setMatchCategoria] = useState('');
  const [matchCidade, setMatchCidade] = useState('');
  const [personalizedBody, setPersonalizedBody] = useState<string | null>(null);
  const [isPersonalizing, setIsPersonalizing] = useState(false);

  // AI generation section
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

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
      toast.success('Copiado para a area de transferencia!');
    } catch {
      toast.error('Falha ao copiar');
    }
  };

  const handleDeleteCustom = (id: string) => {
    if (!confirm('Excluir este template?')) return;
    saveCustomTemplates(customTemplates.filter(t => t.id !== id));
    toast.success('Template excluido');
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
    setView('edit');
  };

  const handleCreateNew = () => {
    setEditingTemplate(null);
    setFormData({ name: '', channel: activeChannel, segment: '', subject: '', body: '' });
    setView('create');
  };

  const handleSaveTemplate = () => {
    if (!formData.name.trim()) {
      toast.error('Digite um nome para o template');
      return;
    }
    if (!formData.body.trim()) {
      toast.error('O corpo da mensagem nao pode estar vazio');
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
    setView('list');
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
      toast.success('Mensagem personalizada com IA!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Erro ao personalizar', { description: message });
    } finally {
      setIsPersonalizing(false);
    }
  };

  const handleGenerateFromAIPrompt = () => {
    if (!aiPrompt.trim()) {
      toast.error('Descreva o que voce quer gerar');
      return;
    }

    setIsGeneratingAI(true);

    // Detect segment from prompt keywords and pre-fill form
    const templateId = getCategoryTemplateId(aiPrompt, activeChannel);
    const presetList = activeChannel === 'whatsapp' ? INTELLIX_WA_TEMPLATES : INTELLIX_EMAIL_TEMPLATES;
    const preset = presetList.find(t => t.id === templateId) || presetList[0];

    setFormData({
      name: `Template IA - ${preset.name}`,
      channel: activeChannel,
      segment: preset.segment,
      subject: activeChannel === 'email' ? (preset as EmailTemplate).subject || '' : '',
      body: preset.body,
    });
    setEditingTemplate(null);
    setView('create');
    setIsGeneratingAI(false);
    toast.success('Template carregado!', {
      description: 'Revise e ajuste o conteudo antes de salvar',
    });
  };

  const waTemplates = INTELLIX_WA_TEMPLATES;
  const emailTemplates = INTELLIX_EMAIL_TEMPLATES;
  const currentPresets = activeChannel === 'whatsapp' ? waTemplates : emailTemplates;
  const channelCustomTemplates = customTemplates.filter(t => t.channel === activeChannel);

  if (view === 'edit' || view === 'create') {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setView('list')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {view === 'edit' ? 'Editar Template' : 'Novo Template'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do template</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Prospecção Clinicas"
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
              <Label>Segmento (livre)</Label>
              <Input
                value={formData.segment}
                onChange={e => setFormData({ ...formData, segment: e.target.value })}
                placeholder="Ex: Clinicas odontologicas"
              />
            </div>

            {formData.channel === 'email' && (
              <div className="space-y-2">
                <Label>Assunto</Label>
                <Input
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Ex: Automatize sua clinica com IA"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Corpo da mensagem</Label>
              <Textarea
                value={formData.body}
                onChange={e => setFormData({ ...formData, body: e.target.value })}
                placeholder={formData.channel === 'email'
                  ? 'HTML ou texto do email...'
                  : 'Mensagem WhatsApp. Use {{nome}} e {{empresa}}...'}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Variaveis: <code>{'{{nome}}'}</code>, <code>{'{{empresa}}'}</code>, <code>{'{{cidade}}'}</code>, <code>{'{{categoria}}'}</code>
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setView('list')}>Cancelar</Button>
            <Button onClick={handleSaveTemplate}>
              {view === 'edit' ? 'Salvar alteracoes' : 'Criar template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Gerenciar Templates de Mensagens
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {/* Channel tabs */}
          <Tabs value={activeChannel} onValueChange={v => {
            setActiveChannel(v as 'whatsapp' | 'email');
            setSelectedPreset(null);
            setPersonalizedBody(null);
          }}>
            <TabsList className="w-full mb-4">
              <TabsTrigger value="whatsapp" className="flex-1 gap-2">
                <MessageSquare className="h-4 w-4" />
                WhatsApp
              </TabsTrigger>
              <TabsTrigger value="email" className="flex-1 gap-2">
                <Mail className="h-4 w-4" />
                Email
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeChannel} className="space-y-6 mt-0">

              {/* Section 1: IntelliX presets */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">📋</span>
                  <h3 className="font-semibold text-sm">Templates IntelliX (pre-definidos)</h3>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {currentPresets.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => setSelectedPreset(selectedPreset?.id === tpl.id ? null : tpl)}
                      className={`text-left p-3 rounded-lg border transition-colors space-y-1 ${
                        selectedPreset?.id === tpl.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold text-foreground leading-tight">{tpl.name}</p>
                        {selectedPreset?.id === tpl.id && (
                          <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0 mt-0.5" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-tight">{tpl.segment}</p>
                    </button>
                  ))}
                </div>

                {selectedPreset && (
                  <Card className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{selectedPreset.name}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(selectedPreset.body)}
                        className="gap-1 text-xs"
                      >
                        <Copy className="h-3 w-3" />
                        Copiar
                      </Button>
                    </div>
                    {activeChannel === 'email' ? (
                      <div className="rounded border overflow-hidden">
                        <iframe
                          srcDoc={(selectedPreset as EmailTemplate).body}
                          className="w-full h-64 border-0"
                          title="Preview email"
                          sandbox="allow-same-origin"
                        />
                      </div>
                    ) : (
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                          {selectedPreset.body}
                        </p>
                      </div>
                    )}
                  </Card>
                )}
              </section>

              {/* Section 2: Category match + personalize */}
              <section className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎯</span>
                  <h3 className="font-semibold text-sm">Match por Categoria</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Preencha os dados do lead e o sistema seleciona o template certo e personaliza com IA.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Empresa *</Label>
                    <Input
                      value={matchEmpresa}
                      onChange={e => setMatchEmpresa(e.target.value)}
                      placeholder="Nome da empresa"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Nome do contato</Label>
                    <Input
                      value={matchNome}
                      onChange={e => setMatchNome(e.target.value)}
                      placeholder="Nome da pessoa"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Categoria / Segmento</Label>
                    <Input
                      value={matchCategoria}
                      onChange={e => setMatchCategoria(e.target.value)}
                      placeholder="Ex: Clinica odontologica"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cidade</Label>
                    <Input
                      value={matchCidade}
                      onChange={e => setMatchCidade(e.target.value)}
                      placeholder="Ex: Recife"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <Button
                  onClick={handlePersonalizeWithAI}
                  disabled={isPersonalizing || !matchEmpresa.trim()}
                  className="gap-2"
                  size="sm"
                >
                  {isPersonalizing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Personalizando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Personalizar com IA
                    </>
                  )}
                </Button>

                {personalizedBody && (
                  <div className="space-y-2">
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
                      <div className="rounded border overflow-hidden">
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
              </section>

              {/* Section 3: AI generation */}
              <section className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-base">✨</span>
                  <h3 className="font-semibold text-sm">Gerar com IA</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Descreva o que quer e carregaremos o template mais proximo para voce customizar.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    placeholder="Ex: Crie uma mensagem para clinicas odontologicas"
                    className="text-sm"
                    onKeyDown={e => { if (e.key === 'Enter') handleGenerateFromAIPrompt(); }}
                  />
                  <Button
                    onClick={handleGenerateFromAIPrompt}
                    disabled={isGeneratingAI || !aiPrompt.trim()}
                    size="sm"
                    className="gap-1 flex-shrink-0"
                  >
                    {isGeneratingAI ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Gerar
                  </Button>
                </div>
              </section>

              {/* Section 4: Custom templates */}
              <section className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📁</span>
                    <h3 className="font-semibold text-sm">Meus Templates</h3>
                    {channelCustomTemplates.length > 0 && (
                      <Badge variant="secondary" className="text-xs">{channelCustomTemplates.length}</Badge>
                    )}
                  </div>
                  <Button size="sm" onClick={handleCreateNew} className="gap-1 h-7 text-xs">
                    <Plus className="h-3 w-3" />
                    Novo Template
                  </Button>
                </div>

                {channelCustomTemplates.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
                    <p className="text-sm">Nenhum template personalizado ainda</p>
                    <p className="text-xs mt-1">Crie um ou use o gerador de IA acima</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {channelCustomTemplates.map(tpl => (
                      <Card key={tpl.id} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm">{tpl.name}</p>
                              {tpl.segment && (
                                <Badge variant="outline" className="text-xs">{tpl.segment}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(tpl.createdAt).toLocaleDateString('pt-BR')}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {tpl.body.replace(/<[^>]*>/g, '').substring(0, 100)}...
                            </p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleCopy(tpl.body)}
                              title="Copiar"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEditCustom(tpl)}
                              title="Editar"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteCustom(tpl.id)}
                              title="Excluir"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>

            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
