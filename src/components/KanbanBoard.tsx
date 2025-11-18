import { useState, useEffect } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCorners } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Phone, MapPin, GripVertical, ExternalLink } from "lucide-react";
import { Lead, LeadStatus, WhatsAppStatus } from "@/types/prospection";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LeadDetailDrawer } from "@/components/LeadDetailDrawer";
import { WHATSAPP_STATUS } from "@/lib/constants";

interface KanbanBoardProps {
  onUpdate?: () => void;
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        className="p-3 mb-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
        onClick={onClick}
      >
        <div className="flex items-start gap-2">
          <div {...attributes} {...listeners} className="cursor-grab pt-1">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <p className="font-semibold text-sm truncate">{lead.lead}</p>
                <p className="text-xs text-muted-foreground truncate">{lead.empresa}</p>
              </div>
              <Badge variant="outline" className="text-xs whitespace-nowrap">
                {lead.categoria}
              </Badge>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              {lead.whatsapp && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  <span className="truncate">{lead.whatsapp}</span>
                </div>
              )}
              {lead.cidade && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
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
  return (
    <div className="flex-shrink-0 w-80 bg-muted/30 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${STATUS_COLORS[status]}`} />
          <h3 className="font-semibold text-sm">{status}</h3>
        </div>
        <Badge variant="secondary" className="text-xs">
          {leads.length}
        </Badge>
      </div>

      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[200px]">
          {leads.map((lead) => (
            <KanbanCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
          ))}
          {leads.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Arraste leads para cá
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export function KanbanBoard({ onUpdate }: KanbanBoardProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("leads_prospeccao")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Mapear para tipo Lead
      const mappedLeads: Lead[] =
        data?.map((row) => ({
          id: row.id,
          lead: row.lead,
          status: (row.estagio_pipeline || row.status || 'Novo Lead') as LeadStatus,
          empresa: row.empresa || undefined,
          categoria: row.categoria || undefined,
          contato: row.contato || undefined,
          whatsapp: row.whatsapp || '',
          telefone: row.telefone || '',
          email: row.email || undefined,
          website: row.website || undefined,
          instagram: row.instagram || undefined,
          cidade: row.cidade || undefined,
          endereco: row.endereco || undefined,
          bairroRegiao: row.bairro_regiao || undefined,
          linkGMN: row.link_gmn || undefined,
          aceitaCartao: row.aceita_cartao || undefined,
          cnpj: row.cnpj || undefined,
          mensagemWhatsApp: row.mensagem_whatsapp || undefined,
          statusMsgWA: (row.status_msg_wa || WHATSAPP_STATUS.NOT_SENT) as WhatsAppStatus,
          dataEnvioWA: row.data_envio_wa || undefined,
          resumoAnalitico: row.resumo_analitico || undefined,
          createdAt: row.created_at || undefined,
          updatedAt: row.updated_at || undefined,
          data: row.data || undefined,
          origem: "Prospecção Ativa",
          prioridade: "Média",
          regiao: row.cidade || undefined,
          segmento: row.categoria || undefined,
          contatoPrincipal: row.contato || undefined,
          dataContato: row.created_at || undefined,
        })) || [];

      setLeads(mappedLeads);
    } catch (error) {
      console.error("Error loading leads:", error);
      toast.error("Erro ao carregar leads");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Se dropou em outra coluna (overId é um status)
    if (LEAD_STATUSES.includes(overId as LeadStatus)) {
      const newStatus = overId as LeadStatus;
      const lead = leads.find((l) => l.id === activeId);

      if (lead && lead.status !== newStatus) {
        // Atualizar otimisticamente
        setLeads((prev) =>
          prev.map((l) => (l.id === activeId ? { ...l, status: newStatus } : l))
        );

        try {
          const { error } = await supabase
            .from("leads_prospeccao")
            .update({
              estagio_pipeline: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq("id", activeId);

          if (error) throw error;

          toast.success(`Lead movido para ${newStatus}`);
          if (onUpdate) onUpdate();
        } catch (error) {
          console.error("Error updating lead:", error);
          toast.error("Erro ao atualizar lead");
          // Reverter mudança
          loadLeads();
        }
      }
    }

    setActiveId(null);
  };

  const handleCardClick = (lead: Lead) => {
    setSelectedLead(lead);
    setDrawerOpen(true);
  };

  const handleDrawerUpdate = () => {
    loadLeads();
    if (onUpdate) onUpdate();
  };

  const leadsByStatus = LEAD_STATUSES.reduce((acc, status) => {
    acc[status] = leads.filter((l) => l.status === status);
    return acc;
  }, {} as Record<LeadStatus, Lead[]>);

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {LEAD_STATUSES.map((status) => (
              <div key={status} data-status={status}>
                <SortableContext
                  id={status}
                  items={leadsByStatus[status].map((l) => l.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <KanbanColumn
                    status={status}
                    leads={leadsByStatus[status]}
                    onCardClick={handleCardClick}
                  />
                </SortableContext>
              </div>
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeLead ? (
            <Card className="p-3 shadow-lg rotate-3 opacity-90">
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
