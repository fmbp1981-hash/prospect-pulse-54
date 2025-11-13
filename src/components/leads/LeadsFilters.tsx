import { LeadStatus, LeadOrigin, LeadPriority } from "@/types/prospection";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface LeadsFiltersProps {
  statusFilter: LeadStatus | "all";
  setStatusFilter: (value: LeadStatus | "all") => void;
  originFilter: LeadOrigin | "all";
  setOriginFilter: (value: LeadOrigin | "all") => void;
  priorityFilter: LeadPriority | "all";
  setPriorityFilter: (value: LeadPriority | "all") => void;
  regionFilter: string;
  setRegionFilter: (value: string) => void;
  segmentFilter: string;
  setSegmentFilter: (value: string) => void;
  hasWhatsAppFilter: boolean;
  setHasWhatsAppFilter: (value: boolean) => void;
}

export const LeadsFilters = ({
  statusFilter,
  setStatusFilter,
  originFilter,
  setOriginFilter,
  priorityFilter,
  setPriorityFilter,
  regionFilter,
  setRegionFilter,
  segmentFilter,
  setSegmentFilter,
  hasWhatsAppFilter,
  setHasWhatsAppFilter,
}: LeadsFiltersProps) => {
  const statusOptions: (LeadStatus | "all")[] = [
    "all",
    "Novo Lead",
    "Contato Inicial",
    "Qualificação",
    "Proposta Enviada",
    "Negociação",
    "Fechado Ganho",
    "Fechado Perdido",
    "Em Follow-up",
  ];

  const originOptions: (LeadOrigin | "all")[] = [
    "all",
    "Prospecção Ativa",
    "Indicação",
    "Site",
    "Redes Sociais",
    "Evento",
    "Outro",
  ];

  const priorityOptions: (LeadPriority | "all")[] = [
    "all",
    "Alta",
    "Média",
    "Baixa",
  ];

  return (
    <div className="rounded-lg border bg-card shadow-card p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status-filter">Status</Label>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as LeadStatus | "all")}>
            <SelectTrigger id="status-filter">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status === "all" ? "Todos os status" : status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="origin-filter">Origem</Label>
          <Select value={originFilter} onValueChange={(value) => setOriginFilter(value as LeadOrigin | "all")}>
            <SelectTrigger id="origin-filter">
              <SelectValue placeholder="Todas as origens" />
            </SelectTrigger>
            <SelectContent>
              {originOptions.map((origin) => (
                <SelectItem key={origin} value={origin}>
                  {origin === "all" ? "Todas as origens" : origin}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority-filter">Prioridade</Label>
          <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as LeadPriority | "all")}>
            <SelectTrigger id="priority-filter">
              <SelectValue placeholder="Todas as prioridades" />
            </SelectTrigger>
            <SelectContent>
              {priorityOptions.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {priority === "all" ? "Todas as prioridades" : priority}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="region-filter">Região</Label>
          <Input
            id="region-filter"
            placeholder="Filtrar por região..."
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="segment-filter">Segmento</Label>
          <Input
            id="segment-filter"
            placeholder="Filtrar por segmento..."
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value)}
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2 pt-2 border-t">
        <Checkbox 
          id="whatsapp-filter" 
          checked={hasWhatsAppFilter}
          onCheckedChange={setHasWhatsAppFilter}
        />
        <label htmlFor="whatsapp-filter" className="text-sm font-medium cursor-pointer">
          Apenas leads com WhatsApp coletado
        </label>
      </div>
    </div>
  );
};
