import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Bot, User, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  message: string;
  from_lead: boolean;
  ai_generated: boolean;
  timestamp: string;
  created_at: string;
}

interface WhatsAppConversationDrawerProps {
  leadId: string | null;
  leadName: string;
  leadPhone: string;
  isOpen: boolean;
  onClose: () => void;
}

export function WhatsAppConversationDrawer({
  leadId,
  leadName,
  leadPhone,
  isOpen,
  onClose,
}: WhatsAppConversationDrawerProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");

  useEffect(() => {
    if (isOpen && leadId) {
      loadConversations();
    }
  }, [isOpen, leadId]);

  const loadConversations = async () => {
    if (!leadId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('lead_id', leadId)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      setConversations(data || []);
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast.error('Erro ao carregar conversas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !leadId) return;

    setIsSending(true);
    try {
      // Aqui você pode chamar a Evolution API diretamente
      // ou salvar a mensagem e deixar o backend enviar

      const { error } = await supabase
        .from('whatsapp_conversations')
        .insert({
          lead_id: leadId,
          message: newMessage,
          from_lead: false,
          ai_generated: false,
          timestamp: new Date().toISOString(),
        });

      if (error) throw error;

      setNewMessage("");
      await loadConversations();
      toast.success("Mensagem enviada!");
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Erro ao enviar mensagem');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Conversa WhatsApp
          </SheetTitle>
          <SheetDescription>
            {leadName} • {leadPhone}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col h-[calc(100vh-12rem)] mt-6">
          {/* Messages Area */}
          <ScrollArea className="flex-1 pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <MessageCircle className="h-12 w-12 mb-4 opacity-50" />
                <p>Nenhuma conversa ainda</p>
                <p className="text-sm">As mensagens aparecerão aqui</p>
              </div>
            ) : (
              <div className="space-y-4">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={cn(
                      "flex gap-3",
                      !conv.from_lead && "flex-row-reverse"
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                        conv.from_lead
                          ? "bg-blue-100 text-blue-600"
                          : "bg-green-100 text-green-600"
                      )}
                    >
                      {conv.from_lead ? (
                        <User className="h-4 w-4" />
                      ) : conv.ai_generated ? (
                        <Bot className="h-4 w-4" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={cn(
                        "flex flex-col max-w-[80%]",
                        !conv.from_lead && "items-end"
                      )}
                    >
                      <div
                        className={cn(
                          "px-4 py-2 rounded-lg",
                          conv.from_lead
                            ? "bg-muted"
                            : "bg-primary text-primary-foreground"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">
                          {conv.message}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        {conv.ai_generated && (
                          <span className="text-xs text-muted-foreground">
                            🤖 IA
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(conv.timestamp).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="flex gap-2 pt-4 border-t">
            <Input
              placeholder="Digite sua mensagem..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isSending}
            />
            <Button
              onClick={handleSendMessage}
              disabled={isSending || !newMessage.trim()}
              size="icon"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
