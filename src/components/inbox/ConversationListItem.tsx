'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { User, Bot } from 'lucide-react';

export interface InboxLead {
  leadId: string;
  leadRef: string;
  name: string;
  whatsapp: string;
  modo_atendimento: string;
  estagio_pipeline: string;
  dataTransferencia: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

interface ConversationListItemProps {
  lead: InboxLead;
  isSelected: boolean;
  onSelect: (lead: InboxLead) => void;
}

export function ConversationListItem({ lead, isSelected, onSelect }: ConversationListItemProps) {
  const isHuman = lead.modo_atendimento === 'humano';

  return (
    <button
      onClick={() => onSelect(lead)}
      className={cn(
        'w-full text-left px-4 py-3 border-b border-border/40 transition-colors hover:bg-muted/50',
        isSelected && 'bg-primary/10 border-l-2 border-l-primary'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{lead.name}</span>
            {isHuman ? (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                <User className="h-2.5 w-2.5 mr-0.5" />
                Humano
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                <Bot className="h-2.5 w-2.5 mr-0.5" />
                Bot
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {lead.lastMessage || 'Sem mensagens'}
          </p>
        </div>
        {lead.lastMessageAt && (
          <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
            {new Date(lead.lastMessageAt).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">
        {lead.leadRef} • {lead.whatsapp}
      </p>
    </button>
  );
}
