"use client";

import { useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCorners, useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Phone, MapPin, GripVertical } from "lucide-react";
import { Lead, LeadStatus } from "@/types/prospection";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LeadDetailDrawer } from "@/components/LeadDetailDrawer";

interface KanbanBoardProps {
  leads: Lead[];
  onLeadUpdate: () => void;
}

const LEAD_STATUSES: LeadStatus[] = [
  "Novo Lead",
  "Contato Inicial",
  "Proposta Enviada",
  "Negociação",
  "Fechado",
  "Follow-up",
];

const STATUS_COLORS: Record<LeadStatus, string> = {
  "Novo Lead": "bg-blue-500",
  "Contato Inicial": "bg-purple-500",
  "Proposta Enviada": "bg-orange-500",
  "Negociação": "bg-indigo-500",
  "Fechado": "bg-green-500",
  "Follow-up": "bg-pink-500",
  // Deprecated statuses (para migração)
  "Qualificação": "bg-yellow-500",
  "Fechado Ganho": "bg-green-500",
  "Fechado Perdido": "bg-red-500",
  "Em Follow-up": "bg-pink-500",
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

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
      // Atualizar no banco
      try {
        const updateData = {
          estagio_pipeline: newStatus,
          updated_at: new Date().toISOString()
        };
        
        const { error } = await supabase
          .from("leads_prospeccao")
          .update(updateData as Record<string, unknown>)
          .eq("id", activeId);

        if (error) throw error;

        toast.success(`Lead movido para ${newStatus}`);
        onLeadUpdate(); // Notificar pai para atualizar lista
      } catch (error) {
        console.error("Error updating lead:", error);
        toast.error("Erro ao atualizar lead");
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
        <div className="overflow-x-auto pb-4 h-[calc(100vh-250px)]">
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

