import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";

export type PeriodType = "7d" | "30d" | "90d" | "all" | "custom";

interface PeriodFilterProps {
  selectedPeriod: PeriodType;
  onPeriodChange: (period: PeriodType) => void;
  customRange?: DateRange;
  onCustomRangeChange?: (range: DateRange | undefined) => void;
}

export function PeriodFilter({
  selectedPeriod,
  onPeriodChange,
  customRange,
  onCustomRangeChange,
}: PeriodFilterProps) {
  const periods: { value: PeriodType; label: string }[] = [
    { value: "7d", label: "Últimos 7 dias" },
    { value: "30d", label: "Últimos 30 dias" },
    { value: "90d", label: "Últimos 90 dias" },
    { value: "all", label: "Todo período" },
    { value: "custom", label: "Personalizado" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">Período:</span>
      <div className="flex gap-2">
        {periods.map((period) => {
          if (period.value === "custom") {
            return (
              <Popover key={period.value}>
                <PopoverTrigger asChild>
                  <Button
                    variant={selectedPeriod === "custom" ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                  >
                    <Calendar className="h-4 w-4" />
                    {selectedPeriod === "custom" && customRange?.from
                      ? `${format(customRange.from, "dd/MM", { locale: ptBR })} - ${
                          customRange.to ? format(customRange.to, "dd/MM", { locale: ptBR }) : "..."
                        }`
                      : period.label}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="range"
                    selected={customRange}
                    onSelect={(range) => {
                      if (onCustomRangeChange) {
                        onCustomRangeChange(range);
                        if (range?.from) {
                          onPeriodChange("custom");
                        }
                      }
                    }}
                    numberOfMonths={2}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            );
          }

          return (
            <Button
              key={period.value}
              variant={selectedPeriod === period.value ? "default" : "outline"}
              size="sm"
              onClick={() => onPeriodChange(period.value)}
            >
              {period.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Calcula o range de datas baseado no período selecionado
 */
export function getDateRangeFromPeriod(period: PeriodType, customRange?: DateRange): DateRange | undefined {
  const now = new Date();

  switch (period) {
    case "7d":
      return {
        from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        to: now,
      };
    case "30d":
      return {
        from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        to: now,
      };
    case "90d":
      return {
        from: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
        to: now,
      };
    case "all":
      return undefined; // Sem filtro
    case "custom":
      return customRange;
    default:
      return undefined;
  }
}

/**
 * Verifica se um lead está dentro do período selecionado
 */
export function isLeadInPeriod(leadDate: string, dateRange?: DateRange): boolean {
  if (!dateRange) return true; // Sem filtro = todos

  const date = new Date(leadDate);

  if (dateRange.from && date < dateRange.from) return false;
  if (dateRange.to && date > dateRange.to) return false;

  return true;
}
