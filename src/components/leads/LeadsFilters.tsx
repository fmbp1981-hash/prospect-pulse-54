import { LeadStatus, WhatsAppStatus } from "@/types/prospection";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar, X } from "lucide-react";
import { useState } from "react";

interface LeadsFiltersProps {
  statusFilter: LeadStatus | "all";
  setStatusFilter: (value: LeadStatus | "all") => void;
  hasWhatsAppFilter: boolean;
  setHasWhatsAppFilter: (value: boolean) => void;
  // Novos filtros
  whatsappStatusFilter?: WhatsAppStatus | "all";
  setWhatsappStatusFilter?: (value: WhatsAppStatus | "all") => void;
  cidadeFilter?: string;
  setCidadeFilter?: (value: string) => void;
  bairroFilter?: string;
  setBairroFilter?: (value: string) => void;
  dateRangeFilter?: { start: string; end: string };
  setDateRangeFilter?: (value: { start: string; end: string } | undefined) => void;
}

export const LeadsFilters = ({
  statusFilter,
  setStatusFilter,
  hasWhatsAppFilter,
  setHasWhatsAppFilter,
  whatsappStatusFilter,
  setWhatsappStatusFilter,
  cidadeFilter,
  setCidadeFilter,
  bairroFilter,
  setBairroFilter,
  dateRangeFilter,
  setDateRangeFilter,
}: LeadsFiltersProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    "Fechado",
    "Follow-up",
  ];

  const whatsappStatusOptions: (WhatsAppStatus | "all")[] = [
    "all",
    "not_sent",
    "sent",
    "failed",
  ];

  const whatsappStatusLabels = {
    all: "Todos",
    not_sent: "Não Enviado",
    sent: "Enviado",
    failed: "Falhou",
  };

  const handleClearFilters = () => {
    setStatusFilter("all");
    setHasWhatsAppFilter(false);
    if (setWhatsappStatusFilter) setWhatsappStatusFilter("all");
    if (setCidadeFilter) setCidadeFilter("");
    if (setBairroFilter) setBairroFilter("");
    if (setDateRangeFilter) setDateRangeFilter(undefined);
  };

  return (
    <div className="rounded-lg border bg-card shadow-card p-4 space-y-4">
      {/* Filtros Básicos */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-2 flex-1 min-w-[200px]">
          <Label htmlFor="status-filter">Status do Lead</Label>
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
            onCheckedChange={(checked) => setHasWhatsAppFilter(checked === true)}
          />
          <label htmlFor="whatsapp-filter" className="text-sm font-medium cursor-pointer">
            Apenas com WhatsApp
          </label>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? "Ocultar" : "Filtros Avançados"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
          >
            <X className="h-4 w-4 mr-1" />
            Limpar
          </Button>
        </div>
      </div>

      {/* Filtros Avançados */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
          {/* Status WhatsApp */}
          {setWhatsappStatusFilter && (
            <div className="space-y-2">
              <Label htmlFor="wa-status-filter">Status WhatsApp</Label>
              <Select
                value={whatsappStatusFilter || "all"}
                onValueChange={(value) => setWhatsappStatusFilter(value as WhatsAppStatus | "all")}
              >
                <SelectTrigger id="wa-status-filter">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {whatsappStatusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {whatsappStatusLabels[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Filtro por Cidade */}
          {setCidadeFilter && (
            <div className="space-y-2">
              <Label htmlFor="cidade-filter">Cidade</Label>
              <Input
                id="cidade-filter"
                placeholder="Ex: São Paulo"
                value={cidadeFilter || ""}
                onChange={(e) => setCidadeFilter(e.target.value)}
              />
            </div>
          )}

          {/* Filtro por Bairro */}
          {setBairroFilter && (
            <div className="space-y-2">
              <Label htmlFor="bairro-filter">Bairro</Label>
              <Input
                id="bairro-filter"
                placeholder="Ex: Centro"
                value={bairroFilter || ""}
                onChange={(e) => setBairroFilter(e.target.value)}
              />
            </div>
          )}

          {/* Filtro por Data */}
          {setDateRangeFilter && (
            <div className="space-y-2">
              <Label>Período de Criação</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={dateRangeFilter?.start || ""}
                  onChange={(e) => setDateRangeFilter({
                    start: e.target.value,
                    end: dateRangeFilter?.end || ""
                  })}
                  placeholder="Data inicial"
                />
                <Input
                  type="date"
                  value={dateRangeFilter?.end || ""}
                  onChange={(e) => setDateRangeFilter({
                    start: dateRangeFilter?.start || "",
                    end: e.target.value
                  })}
                  placeholder="Data final"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
