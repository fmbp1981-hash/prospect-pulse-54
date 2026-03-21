'use client';

import { useEffect, useState, useCallback, type MutableRefObject } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search } from 'lucide-react';
import { ConversationListItem, type InboxLead } from './ConversationListItem';

type FilterTab = 'transferred' | 'mine' | 'all';

interface ConversationListProps {
  selectedLeadId: string | null;
  onSelectLead: (lead: InboxLead) => void;
  refreshRef?: MutableRefObject<(() => void) | null>;
}

export function ConversationList({ selectedLeadId, onSelectLead, refreshRef }: ConversationListProps) {
  const { user } = useAuth();
  const [leads, setLeads] = useState<InboxLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox/conversations?filter=${filter}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const newLeads: InboxLead[] = data.leads || [];
      setLeads(newLeads);
    } catch (err) {
      console.error('[ConversationList] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  // Keep selected lead in sync with fresh list data (e.g. after modo_atendimento changes)
  useEffect(() => {
    if (selectedLeadId && leads.length > 0) {
      const updated = leads.find((l) => l.leadId === selectedLeadId);
      if (updated) onSelectLead(updated);
    }
    // Only fire when leads array reference changes (after re-fetch), not on prop changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads]);

  // Expose refresh to parent via ref
  useEffect(() => {
    if (refreshRef) refreshRef.current = fetchLeads;
  }, [refreshRef, fetchLeads]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Realtime subscription: refetch on lead changes 
  useEffect(() => {
    const channel = supabase
      .channel('inbox-list-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads_prospeccao' },
        () => fetchLeads()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_conversations' },
        () => fetchLeads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLeads]);

  const filtered = search.trim()
    ? leads.filter(
        (l) =>
          l.name.toLowerCase().includes(search.toLowerCase()) ||
          l.whatsapp.includes(search) ||
          l.leadRef.toLowerCase().includes(search.toLowerCase())
      )
    : leads;

  return (
    <div className="flex flex-col h-full border-r border-border">
      {/* Filter tabs */}
      <div className="p-3 border-b border-border space-y-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
          <TabsList className="w-full">
            <TabsTrigger value="transferred" className="flex-1 text-xs">
              Transferidos
            </TabsTrigger>
            <TabsTrigger value="mine" className="flex-1 text-xs">
              Meus
            </TabsTrigger>
            <TabsTrigger value="all" className="flex-1 text-xs">
              Todos
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Nenhuma conversa encontrada
          </div>
        ) : (
          filtered.map((lead) => (
            <ConversationListItem
              key={lead.leadId}
              lead={lead}
              isSelected={lead.leadId === selectedLeadId}
              onSelect={onSelectLead}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
}
