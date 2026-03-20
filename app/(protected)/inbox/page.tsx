'use client';

import { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { RoleGuard } from '@/components/RoleGuard';
import { ConversationList } from '@/components/inbox/ConversationList';
import { ConversationThread } from '@/components/inbox/ConversationThread';
import { useUnreadConversations } from '@/hooks/useUnreadConversations';
import type { InboxLead } from '@/components/inbox/ConversationListItem';

export default function InboxPage() {
  const [selectedLead, setSelectedLead] = useState<InboxLead | null>(null);
  const { markAsRead } = useUnreadConversations();

  // Clear unread badge when the inbox page is opened
  useEffect(() => {
    markAsRead();
  }, [markAsRead]);

  return (
    <RoleGuard
      allowedRoles={['admin', 'operador']}
      fallback={
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p>Você não tem permissão para acessar o Inbox.</p>
        </div>
      }
    >
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Page title */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Inbox do Consultor</h1>
        </div>

        {/* Two-panel layout */}
        <div className="flex flex-1 min-h-0">
          {/* Left panel: conversation list */}
          <div className="w-80 shrink-0">
            <ConversationList
              selectedLeadId={selectedLead?.leadId ?? null}
              onSelectLead={setSelectedLead}
            />
          </div>

          {/* Right panel: thread or empty */}
          <div className="flex-1 min-w-0">
            {selectedLead ? (
              <ConversationThread lead={selectedLead} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <MessageSquare className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">Selecione uma conversa</p>
                <p className="text-sm mt-1">Escolha um lead na lista ao lado para ver a conversa</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
