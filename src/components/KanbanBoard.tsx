"use client";

import { useState, useEffect, useCallback } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCorners, useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Phone, MapPin, GripVertical, RefreshCw } from "lucide-react";
import { Lead, LeadStatus } from "@/types/prospection";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LeadDetailDrawer } from "@/components/LeadDetailDrawer";
import type { Database } from "@/integrations/supabase/types";

interface KanbanBoardProps {
  leads: Lead[];
  onLeadUpdate: () => void;
}

// Novo Pipeline: 7 Estágios (reorganizado em 2025)
const LEAD_STATUSES: LeadStatus[] = [
  "Novo Lead",                    // #1 - Prospecção via sistema (blue-500)
  "Contato Inicial",              // #2 - MSG WhatsApp disparada (purple-500)
  "Qualificação",                 // #3 - Agente IA qualificando (amber-500)
  "Transferido para Consultor",   // #4 - Lead qualificado (cyan-500)
  "Fechado Ganho",                // #5 - Negócio fechado com sucesso (green-500)
  "Fechado Perdido",              // #6 - Negócio não fechou (red-500)
  "Follow-up",                    // #7 - Não qualificados ou estagnados >= 7 dias (pink-500)
];

// Cores do novo pipeline (7 estágios)
const STATUS_COLORS: Record<LeadStatus, string> = {
  // Pipeline Principal
  "Novo Lead": "bg-blue-500",
  "Contato Inicial": "bg-purple-500",
  "Qualificação": "bg-amber-500",
  "Transferido para Consultor": "bg-cyan-500",
  "Fechado Ganho": "bg-green-500",
  "Fechado Perdido": "bg-red-500",
  "Follow-up": "bg-pink-500",
  // Deprecated statuses (para retrocompatibilidade)
  "Proposta Enviada": "bg-amber-500",   // Migra → Qualificação
  "Negociação": "bg-cyan-500",          // Migra → Transferido para Consultor
  "Fechado": "bg-green-500",            // Migra → Fechado Ganho
  "Em Follow-up": "bg-pink-500",        // Migra → Follow-up
  "Novo": "bg-blue-500",                // Migra → Novo Lead
};

interface KanbanCardProps {
  lead: Lead;
  onClick: () => void;
}

function KanbanCard({ lead, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: {
      lead,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0 : 1,
    visibility: isDragging ? 'hidden' as const : 'visible' as const,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className="p-3 mb-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow overflow-hidden bg-card"
        onClick={onClick}
      >
        <div className="flex items-start gap-2">
          <div className="cursor-grab pt-1 flex-shrink-0">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{lead.lead}</p>
                <p className="text-xs text-muted-foreground truncate">{lead.empresa}</p>
              </div>
              {lead.categoria && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 max-w-[100px]">
                  <span className="truncate">{lead.categoria}</span>
                </Badge>
              )}
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              {lead.whatsapp && (
                <div className="flex items-center gap-1 min-w-0">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="truncate">{lead.whatsapp}</span>
                </div>
              )}
              {lead.cidade && (
                <div className="flex items-center gap-1 min-w-0">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{lead.cidade}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

interface KanbanColumnProps {
  status: LeadStatus;
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
}

function KanbanColumn({ status, leads, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-80 bg-muted/30 rounded-lg p-4 transition-colors h-full flex flex-col ${isOver ? 'bg-muted/50 ring-2 ring-primary/50' : ''
        }`}
    >
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${STATUS_COLORS[status]}`} />
          <h3 className="font-semibold text-sm">{status}</h3>
        </div>
        <Badge variant="secondary" className="text-xs">
          {leads.length}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto min-h-[100px] pr-1 custom-scrollbar">
        {leads.map((lead) => (
          <KanbanCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
        ))}
        {leads.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed border-muted rounded-lg">
            Arraste leads para cá
          </div>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({ leads, onLeadUpdate }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isRealTimeConnected, setIsRealTimeConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Supabase Realtime subscription para atualizações automáticas
  useEffect(() => {
    // Debounce para evitar muitas atualizações simultâneas
    let updateTimeout: NodeJS.Timeout | null = null;

    const debouncedUpdate = () => {
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      updateTimeout = setTimeout(() => {
        setLastUpdate(new Date());
        onLeadUpdate();
      }, 500); // Debounce de 500ms
    };

    // Configurar subscription para mudanças na tabela leads_prospeccao
    const channel = supabase
      .channel('kanban-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'leads_prospeccao',
        },
        (payload) => {
          console.log('📡 Kanban Realtime: Mudança detectada', payload.eventType);
          debouncedUpdate();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsRealTimeConnected(true);
          console.log('✅ Kanban Realtime: Conectado');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsRealTimeConnected(false);
          console.log('❌ Kanban Realtime: Desconectado');
        }
      });

    // Cleanup: remover subscription quando componente desmontar
    return () => {
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      supabase.removeChannel(channel);
      setIsRealTimeConnected(false);
    };
  }, [onLeadUpdate]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) {
      return;
    }

    const activeId = active.id as string;
    const newStatus = over.id as LeadStatus;

    // Verificar se é um status válido
    if (!LEAD_STATUSES.includes(newStatus)) {
      return;
    }

    const lead = leads.find((l) => l.id === activeId);

    if (lead && lead.status !== newStatus) {
      // Atualização otimista - atualizar UI imediatamente
      const previousStatus = lead.status;
      
      // Atualizar estado local imediatamente para feedback instantâneo
      // O componente pai receberá a atualização via Realtime
      lead.status = newStatus;
      
      // Atualizar no banco
      try {
        const updateData = {
          estagio_pipeline: newStatus,
          updated_at: new Date().toISOString()
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("leads_prospeccao")
          .update(updateData)
          .eq("id", activeId);

        if (error) throw error;

        toast.success(`Lead movido para ${newStatus}`);
        // Não chamar onLeadUpdate() - deixar o Realtime sincronizar
      } catch (error) {
        console.error("Error updating lead:", error);
        // Reverter mudança otimista em caso de erro
        lead.status = previousStatus;
        toast.error("Erro ao atualizar lead");
        onLeadUpdate(); // Forçar refresh apenas em caso de erro
      }
    }
  };

  const handleCardClick = (lead: Lead) => {
    setSelectedLead(lead);
    setDrawerOpen(true);
  };

  const handleDrawerUpdate = () => {
    onLeadUpdate();
  };

  const leadsByStatus = LEAD_STATUSES.reduce((acc, status) => {
    acc[status] = leads.filter((l) => l.status === status);
    return acc;
  }, {} as Record<LeadStatus, Lead[]>);

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Indicador de sincronização em tempo real */}
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <div className={`h-2 w-2 rounded-full ${isRealTimeConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span>{isRealTimeConnected ? 'Sincronização ativa' : 'Sincronização offline'}</span>
          {lastUpdate && (
            <span className="ml-2 flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="overflow-x-auto pb-4 h-[calc(100vh-280px)]">
          <div className="flex gap-4 min-w-max h-full">
            {LEAD_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                leads={leadsByStatus[status]}
                onCardClick={handleCardClick}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeLead ? (
            <Card className="p-3 shadow-lg rotate-3 opacity-90 w-72 cursor-grabbing">
              <div className="flex items-start gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">{activeLead.lead}</p>
                  <p className="text-xs text-muted-foreground">{activeLead.empresa}</p>
                </div>
              </div>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>

      <LeadDetailDrawer
        lead={selectedLead}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedLead(null);
        }}
        onUpdate={handleDrawerUpdate}
      />
    </>
  );
}

