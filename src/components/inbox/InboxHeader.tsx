'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserCheck, RotateCcw, Phone, Bot, User } from 'lucide-react';
import type { InboxLead } from './ConversationListItem';

interface InboxHeaderProps {
  lead: InboxLead;
  isAssumed: boolean;
  isTakingOver: boolean;
  isReturning: boolean;
  onTakeover: () => void;
  onReturn: () => void;
}

export function InboxHeader({
  lead,
  isAssumed,
  isTakingOver,
  isReturning,
  onTakeover,
  onReturn,
}: InboxHeaderProps) {
  const isHuman = lead.modo_atendimento === 'humano';

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Phone className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm truncate">{lead.name}</h2>
            {isHuman ? (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                <User className="h-2.5 w-2.5 mr-0.5" />
                Humano
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                <Bot className="h-2.5 w-2.5 mr-0.5" />
                Bot
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {lead.leadRef} • {lead.whatsapp}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!isAssumed ? (
          <Button
            size="sm"
            onClick={onTakeover}
            disabled={isTakingOver}
            className="gap-1.5"
          >
            <UserCheck className="h-4 w-4" />
            {isTakingOver ? 'Assumindo...' : 'Assumir'}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={onReturn}
            disabled={isReturning}
            className="gap-1.5"
          >
            <RotateCcw className="h-4 w-4" />
            {isReturning ? 'Devolvendo...' : 'Devolver ao Bot'}
          </Button>
        )}
      </div>
    </div>
  );
}
