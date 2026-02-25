'use client';

import { useCallback, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LayoutGrid, Loader2 } from "lucide-react";
import { supabaseCRM } from "@/lib/supabaseCRM";
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/types/prospection";
import { toast } from "sonner";

export default function KanbanPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadLeads = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await supabaseCRM.syncAllLeads();
      if (result.success) {
        setLeads(Array.isArray(result.leads) ? result.leads : []);
      } else {
        toast.error("Erro ao carregar leads");
      }
    } catch (error) {
      console.error("Erro ao carregar leads:", error);
      toast.error("Erro ao carregar leads");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // Realtime: atualiza Kanban quando o agente altera um lead no banco
  useEffect(() => {
    const channel = supabase
      .channel('kanban-leads-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads_prospeccao' },
        () => { loadLeads(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadLeads]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando Kanban Board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          <LayoutGrid className="h-10 w-10 text-primary" />
          Kanban Board
        </h1>
        <p className="text-xl text-muted-foreground">
          Visualize e gerencie seus leads arrastando entre as colunas
        </p>
      </div>

      {/* Kanban Board */}
      <div className="animate-fade-in">
        <KanbanBoard leads={leads} onLeadUpdate={loadLeads} />
      </div>
    </div>
  );
}
