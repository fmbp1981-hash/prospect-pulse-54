'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MessageCircle, User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { InboxHeader } from './InboxHeader';
import { MessageInput } from './MessageInput';
import type { InboxLead } from './ConversationListItem';

interface Message {
  id: string;
  message: string;
  from_lead: boolean;
  ai_generated: boolean;
  timestamp: string;
}

interface ConversationThreadProps {
  lead: InboxLead;
}

export function ConversationThread({ lead }: ConversationThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAssumed, setIsAssumed] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset assumed state when lead changes
  useEffect(() => {
    setIsAssumed(lead.modo_atendimento === 'humano');
  }, [lead.leadId, lead.modo_atendimento]);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('whatsapp_conversations')
        .select('id, message_lead, message_agent, from_lead, ai_generated, timestamp')
        .eq('lead_id', lead.leadId)
        .order('timestamp', { ascending: true })
        .limit(100);

      if (error) throw error;

      const mapped: Message[] = (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        message: (row.from_lead ? row.message_lead : row.message_agent) as string || '',
        from_lead: row.from_lead as boolean,
        ai_generated: row.ai_generated as boolean,
        timestamp: row.timestamp as string,
      }));

      setMessages(mapped);
    } catch (err) {
      console.error('[ConversationThread] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [lead.leadId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime for new messages
  useEffect(() => {
    const channel = supabase
      .channel(`inbox-thread-${lead.leadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_conversations',
          filter: `lead_id=eq.${lead.leadId}`,
        },
        () => fetchMessages()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lead.leadId, fetchMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleTakeover = async () => {
    setIsTakingOver(true);
    try {
      const res = await fetch('/api/inbox/takeover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.leadId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Takeover failed');
      }
      setIsAssumed(true);
      toast.success('Conversa assumida com sucesso!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao assumir conversa');
    } finally {
      setIsTakingOver(false);
    }
  };

  const handleReturn = async () => {
    setIsReturning(true);
    try {
      const res = await fetch('/api/inbox/return-to-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.leadId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Return failed');
      }
      setIsAssumed(false);
      toast.success('Conversa devolvida ao bot!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao devolver conversa');
    } finally {
      setIsReturning(false);
    }
  };

  const handleSend = async (message: string) => {
    const res = await fetch('/api/inbox/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.leadId, message }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Send failed');
    }
    toast.success('Mensagem enviada!');
  };

  return (
    <div className="flex flex-col h-full">
      <InboxHeader
        lead={lead}
        isAssumed={isAssumed}
        isTakingOver={isTakingOver}
        isReturning={isReturning}
        onTakeover={handleTakeover}
        onReturn={handleReturn}
      />

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageCircle className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm">Nenhuma mensagem ainda</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex gap-2.5', !msg.from_lead && 'flex-row-reverse')}
              >
                <div
                  className={cn(
                    'shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
                    msg.from_lead
                      ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                  )}
                >
                  {msg.from_lead ? (
                    <User className="h-3.5 w-3.5" />
                  ) : msg.ai_generated ? (
                    <Bot className="h-3.5 w-3.5" />
                  ) : (
                    <User className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className={cn('flex flex-col max-w-[75%]', !msg.from_lead && 'items-end')}>
                  <div
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm',
                      msg.from_lead ? 'bg-muted' : 'bg-primary text-primary-foreground'
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {msg.ai_generated && (
                      <span className="text-[10px] text-muted-foreground">🤖 IA</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleString('pt-BR', {
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
            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>

      <MessageInput disabled={!isAssumed} onSend={handleSend} />
    </div>
  );
}
