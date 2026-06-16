"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, ImagePlus, Link, X, FileImage } from "lucide-react";
import { Lead } from "@/types/prospection";
import { supabaseCRM } from "@/lib/supabaseCRM";
import { auditWhatsAppDispatch } from "@/lib/audit";
import { leadAutomation } from "@/lib/leadAutomation";
import { toast } from "sonner";

type MediaMode = 'none' | 'upload' | 'url';

interface DispatchStatus {
  leadId: string;
  leadName: string;
  message?: string;
  status: "pending" | "sending" | "sent" | "failed";
  error?: string;
}

interface WhatsAppDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLeads: Lead[];
}

export const WhatsAppDispatchModal = ({
  isOpen,
  onClose,
  selectedLeads
}: WhatsAppDispatchModalProps) => {
  const [statuses, setStatuses] = useState<DispatchStatus[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [showTestConfirm, setShowTestConfirm] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [editedMessage, setEditedMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Mídia
  const [mediaMode, setMediaMode] = useState<MediaMode>('none');
  const [mediaPreview, setMediaPreview] = useState<string>('');
  const [mediaBase64, setMediaBase64] = useState<string>('');
  const [mediaMimetype, setMediaMimetype] = useState<string>('');
  const [mediaFileName, setMediaFileName] = useState<string>('');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasMedia = mediaMode === 'upload' ? !!mediaBase64 : mediaMode === 'url' ? !!mediaUrl.trim() : false;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Formato não suportado', { description: 'Use JPG, PNG, WebP ou GIF.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande', { description: 'Tamanho máximo: 5 MB.' });
      return;
    }

    setMediaFileName(file.name);
    setMediaMimetype(file.type);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setMediaPreview(result);
      // Remove o prefixo "data:image/...;base64,"
      setMediaBase64(result.split(',')[1] || '');
    };
    reader.readAsDataURL(file);
  };

  const clearMedia = () => {
    setMediaMode('none');
    setMediaPreview('');
    setMediaBase64('');
    setMediaMimetype('');
    setMediaFileName('');
    setMediaUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validLeads = useMemo(() => selectedLeads.filter(lead =>
    lead.whatsapp &&
    lead.whatsapp.trim() !== "" &&
    lead.mensagemWhatsApp &&
    lead.mensagemWhatsApp.trim() !== ""
  ), [selectedLeads]);

  const leadsWithoutWhatsApp = useMemo(() => selectedLeads.filter(lead =>
    !lead.whatsapp || lead.whatsapp.trim() === ""
  ), [selectedLeads]);

  const leadsWithoutMessage = useMemo(() => selectedLeads.filter(lead =>
    lead.whatsapp && lead.whatsapp.trim() !== "" && !lead.mensagemWhatsApp
  ), [selectedLeads]);

  const alreadySent = useMemo(() => selectedLeads.filter(lead => lead.statusMsgWA === 'sent'), [selectedLeads]);

  useEffect(() => {
    if (isOpen && validLeads.length === 1) {
      setEditedMessage(validLeads[0].mensagemWhatsApp || "");
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
  }, [isOpen, validLeads.length]);

  useEffect(() => {
    if (isOpen && validLeads.length > 0) {
      setStatuses(
        validLeads.map(lead => ({
          leadId: lead.id,
          leadName: lead.lead,
          message: lead.mensagemWhatsApp,
          status: "pending" as const
        }))
      );
    }
  }, [isOpen, validLeads]);

  // ── Envio de teste ─────────────────────────────────────────────────────────
  const handleTestSend = async () => {
    if (validLeads.length === 0) {
      toast.error("Nenhum lead válido para teste");
      return;
    }
    if (!testPhoneNumber.trim()) {
      toast.error("Digite um número de WhatsApp para teste");
      return;
    }

    setTestMode(true);
    setIsDispatching(true);
    setShowTestConfirm(false);

    const testLead = validLeads[0];
    const messageToSend = (isEditing && editedMessage) ? editedMessage : testLead.mensagemWhatsApp;

    setStatuses([{
      leadId: testLead.id,
      leadName: testLead.lead,
      message: messageToSend,
      status: "sending"
    }]);

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsapp: testPhoneNumber,
          message: messageToSend,
          ...(mediaMode === 'upload' && mediaBase64 ? { mediaBase64, mediaMimetype, mediaFileName, mediaType: 'image' } : {}),
          ...(mediaMode === 'url' && mediaUrl ? { mediaUrl, mediaType: 'image' } : {}),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `Erro ${response.status}`);
      }

      setStatuses([{
        leadId: testLead.id,
        leadName: testLead.lead,
        message: messageToSend,
        status: "sent"
      }]);

      toast.success("Mensagem de teste enviada com sucesso!", {
        description: `Enviado para ${testPhoneNumber}`,
      });
    } catch (error) {
      setStatuses([{
        leadId: testLead.id,
        leadName: testLead.lead,
        message: messageToSend,
        status: "failed",
        error: String(error)
      }]);

      toast.error("Falha no envio de teste", { description: String(error) });
    }

    setIsDispatching(false);
  };

  // ── Envio em massa ─────────────────────────────────────────────────────────
  const handleDispatch = async () => {
    if (isDispatching || validLeads.length === 0) {
      toast.error("Nenhum lead válido para enviar", {
        description: "Verifique se os leads possuem WhatsApp e mensagem configurados"
      });
      return;
    }

    setTestMode(false);
    setIsDispatching(true);

    for (let i = 0; i < validLeads.length; i++) {
      const lead = validLeads[i];

      if (!lead.whatsapp || lead.whatsapp.trim() === "") {
        setStatuses(prev => prev.map(s =>
          s.leadId === lead.id
            ? { ...s, status: "failed", error: "WhatsApp não coletado" }
            : s
        ));
        continue;
      }

      setStatuses(prev => prev.map(s =>
        s.leadId === lead.id ? { ...s, status: "sending" } : s
      ));

      const messageToSend = (isEditing && editedMessage && validLeads.length === 1)
        ? editedMessage
        : lead.mensagemWhatsApp;

      try {
        const response = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            whatsapp: lead.whatsapp,
            message: messageToSend,
            ...(mediaMode === 'upload' && mediaBase64 ? { mediaBase64, mediaMimetype, mediaFileName, mediaType: 'image' } : {}),
            ...(mediaMode === 'url' && mediaUrl ? { mediaUrl, mediaType: 'image' } : {}),
          }),
        });

        const result = await response.json();
        const isSuccess = response.ok && result.success === true;

        if (isSuccess) {
          // Atualiza status de envio no banco
          await supabaseCRM.updateLead(lead.id, {
            statusMsgWA: "sent",
            dataEnvioWA: new Date().toISOString(),
            ...(isEditing && validLeads.length === 1 ? { mensagemWhatsApp: messageToSend } : {})
          });

          // Move lead para "Contato Inicial" se ainda era Novo
          if ((lead.status as string) === "Novo Lead" || (lead.status as string) === "Novo") {
            await leadAutomation.moveToContatoInicial(lead.id);
          }
        }

        setStatuses(prev => prev.map(s =>
          s.leadId === lead.id
            ? {
              ...s,
              status: isSuccess ? "sent" : "failed",
              error: isSuccess ? undefined : (result.error || `Erro ${response.status}`),
              message: messageToSend,
            }
            : s
        ));

        // Intervalo entre envios (evita ban por spam)
        if (i < validLeads.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (error) {
        setStatuses(prev => prev.map(s =>
          s.leadId === lead.id
            ? { ...s, status: "failed", error: String(error) }
            : s
        ));
      }
    }

    // Log de auditoria
    const sentCount = statuses.filter(s => s.status === "sent").length;
    const failedCount = statuses.filter(s => s.status === "failed").length;
    await auditWhatsAppDispatch(validLeads.map(l => l.id), sentCount, failedCount);

    setIsDispatching(false);
  };

  const progress = statuses.length > 0
    ? (statuses.filter(s => s.status === "sent" || s.status === "failed").length / statuses.length) * 100
    : 0;
  const sentCount = statuses.filter(s => s.status === "sent").length;
  const failedCount = statuses.filter(s => s.status === "failed").length;
  const isComplete = progress === 100;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Envio de Mensagens WhatsApp</DialogTitle>
        </DialogHeader>

        {/* Avisos */}
        {(leadsWithoutWhatsApp.length > 0 || leadsWithoutMessage.length > 0 || alreadySent.length > 0) && (
          <div className="space-y-2">
            {leadsWithoutWhatsApp.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900">
                      {leadsWithoutWhatsApp.length} lead(s) sem número de WhatsApp coletado
                    </p>
                    <p className="text-xs text-red-700 mt-1">Estes leads não receberão mensagens:</p>
                    <ul className="text-xs text-red-600 mt-2 space-y-1 max-h-24 overflow-y-auto">
                      {leadsWithoutWhatsApp.map(lead => (
                        <li key={lead.id}>• {lead.lead} ({lead.empresa})</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            {leadsWithoutMessage.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-900">
                      {leadsWithoutMessage.length} lead(s) sem mensagem configurada
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">Configure a mensagem no CRM antes de enviar:</p>
                    <ul className="text-xs text-yellow-600 mt-2 space-y-1 max-h-24 overflow-y-auto">
                      {leadsWithoutMessage.map(lead => (
                        <li key={lead.id}>• {lead.lead}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            {alreadySent.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-900">
                      {alreadySent.length} lead(s) já receberam mensagem anteriormente
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      O reenvio será realizado mesmo assim. Verifique se é intencional.
                    </p>
                    <ul className="text-xs text-amber-600 mt-2 space-y-1 max-h-24 overflow-y-auto">
                      {alreadySent.map(lead => (
                        <li key={lead.id}>
                          • {lead.lead}
                          {lead.dataEnvioWA ? (
                            <span className="ml-1 text-amber-500">
                              (enviado em {new Date(lead.dataEnvioWA).toLocaleDateString('pt-BR')})
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {validLeads.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum lead válido para envio de mensagens.
          </div>
        ) : (
          <>
            {/* Progress Bar */}
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span className="text-success font-medium">{sentCount} enviados</span>
                <span className="text-destructive font-medium">{failedCount} falhas</span>
                <span>{validLeads.length} total</span>
              </div>
            </div>

            {/* Seção de mídia */}
            {!isDispatching && !isComplete && (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <FileImage className="h-4 w-4 text-muted-foreground" />
                    Anexar imagem (opcional)
                  </span>
                  {mediaMode !== 'none' && (
                    <button onClick={clearMedia} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {mediaMode === 'none' && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={() => { setMediaMode('upload'); setTimeout(() => fileInputRef.current?.click(), 50); }}
                    >
                      <ImagePlus className="h-4 w-4" />
                      Upload de arquivo
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={() => setMediaMode('url')}
                    >
                      <Link className="h-4 w-4" />
                      Inserir URL
                    </Button>
                  </div>
                )}

                {/* Upload de arquivo */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                {mediaMode === 'upload' && !mediaBase64 && (
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Clique para selecionar uma imagem</p>
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP ou GIF • máx. 5 MB</p>
                  </div>
                )}

                {mediaMode === 'upload' && mediaBase64 && (
                  <div className="relative rounded-lg overflow-hidden border bg-background">
                    <img src={mediaPreview} alt="Preview" className="w-full max-h-40 object-contain" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
                      <p className="text-xs text-white truncate">{mediaFileName}</p>
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute top-2 right-2 bg-background/80 rounded-full p-1 hover:bg-background"
                    >
                      <ImagePlus className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {mediaMode === 'url' && (
                  <div className="space-y-2">
                    <input
                      type="url"
                      placeholder="https://exemplo.com/imagem.jpg"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                    />
                    {mediaUrl && (
                      <div className="rounded-lg overflow-hidden border bg-background">
                        <img
                          src={mediaUrl}
                          alt="Preview URL"
                          className="w-full max-h-40 object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      A URL deve ser pública e acessível. A imagem será enviada antes da mensagem de texto.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Lista de status ou Editor Único */}
            <div className="space-y-2 overflow-y-auto flex-1 pr-2">
              {isEditing && validLeads.length === 1 && !isDispatching && !isComplete ? (
                <div className="space-y-2 p-1">
                  <label className="text-sm font-medium">Editar Mensagem para {validLeads[0].lead}:</label>
                  <textarea
                    className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={editedMessage}
                    onChange={(e) => setEditedMessage(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Você pode personalizar a mensagem final antes de enviar.
                  </p>
                </div>
              ) : (
                statuses.map(status => (
                  <div key={status.leadId} className="flex flex-col gap-1 p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate flex-1">{status.leadName}</span>
                      {status.status === "pending" && <Badge variant="outline">Aguardando</Badge>}
                      {status.status === "sending" && (
                        <Badge variant="secondary" className="gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Enviando...
                        </Badge>
                      )}
                      {status.status === "sent" && (
                        <Badge className="gap-2 bg-success hover:bg-success/90">
                          <CheckCircle2 className="h-3 w-3" />
                          Enviado
                        </Badge>
                      )}
                      {status.status === "failed" && (
                        <Badge variant="destructive" className="gap-2">
                          <XCircle className="h-3 w-3" />
                          Falha
                        </Badge>
                      )}
                    </div>
                    {status.message && (
                      <p className="text-xs text-muted-foreground truncate">
                        📱 {status.message.substring(0, 60)}...
                      </p>
                    )}
                    {status.error && status.status === "failed" && (
                      <p className="text-xs text-destructive">⚠️ {status.error}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Botões de ação */}
        <div className="flex flex-col gap-2 pt-4 border-t">
          {isComplete ? (
            <Button onClick={onClose} className="w-full">Fechar</Button>
          ) : (
            <>
              {!isDispatching && validLeads.length > 0 && !testMode && (
                <Button
                  variant="secondary"
                  onClick={() => setShowTestConfirm(true)}
                  className="w-full"
                >
                  📤 Enviar Teste (1 mensagem)
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={isDispatching}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleDispatch}
                  disabled={isDispatching || validLeads.length === 0}
                  className="flex-1"
                >
                  {isDispatching && !testMode ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
                  ) : (
                    `Enviar para ${validLeads.length} lead(s)`
                  )}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Modal de Confirmação de Teste */}
        {showTestConfirm && validLeads.length > 0 && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center p-6 rounded-lg z-50">
            <div className="bg-card border rounded-lg p-6 max-w-md w-full space-y-4 shadow-lg">
              <div>
                <h3 className="text-lg font-semibold mb-2">Confirmar Envio de Teste</h3>
                <p className="text-sm text-muted-foreground">
                  Configure o número de destino para o teste.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Número de WhatsApp para Teste</label>
                <input
                  type="text"
                  placeholder="Ex: 5511999999999"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={testPhoneNumber}
                  onChange={(e) => setTestPhoneNumber(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Digite o número completo com DDI e DDD (apenas números).
                </p>
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium">Lead Simulado:</span>
                  <span className="text-sm text-right">{validLeads[0].lead}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium">Empresa:</span>
                  <span className="text-sm text-right">{validLeads[0].empresa}</span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-blue-900">Preview da Mensagem:</p>
                {hasMedia && (
                  <div className="rounded overflow-hidden border border-blue-200 bg-white">
                    <img
                      src={mediaMode === 'upload' ? mediaPreview : mediaUrl}
                      alt="Mídia anexada"
                      className="w-full max-h-32 object-contain"
                    />
                    <p className="text-xs text-blue-600 px-2 py-1">📎 Imagem anexada</p>
                  </div>
                )}
                <p className="text-xs text-blue-800 whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {(isEditing && editedMessage) ? editedMessage : validLeads[0].mensagemWhatsApp}
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowTestConfirm(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleTestSend}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  Enviar Teste
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
