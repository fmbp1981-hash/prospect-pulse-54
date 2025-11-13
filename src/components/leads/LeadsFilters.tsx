import { LeadStatus } from "@/types/prospection";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface LeadsFiltersProps {
  statusFilter: LeadStatus | "all";
  setStatusFilter: (value: LeadStatus | "all") => void;
  hasWhatsAppFilter: boolean;
  setHasWhatsAppFilter: (value: boolean) => void;
}

export const LeadsFilters = ({
  statusFilter,
  setStatusFilter,
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

  return (
    <div className="rounded-lg border bg-card shadow-card p-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-2 flex-1 min-w-[200px]">
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
        
        <div className="flex items-center gap-2 pb-1">
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
    </div>
  );
};
