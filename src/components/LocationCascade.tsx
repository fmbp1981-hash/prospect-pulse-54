import { useState, useRef, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MapPin, Search, ChevronDown, Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { LocationData as ProspectionLocationData } from "@/types/prospection";
import CITIES_BY_STATE from "@/data/brazilianCities.json";

export type LocationData = ProspectionLocationData;

interface LocationCascadeProps {
  value: LocationData;
  onChange: (location: LocationData) => void;
}

// Estados brasileiros
const BRAZILIAN_STATES = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará",
  "Distrito Federal", "Espírito Santo", "Goiás", "Maranhão",
  "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará",
  "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio de Janeiro",
  "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima",
  "Santa Catarina", "São Paulo", "Sergipe", "Tocantins",
];

const MAX_VISIBLE = 50;

/**
 * Dropdown com busca integrada para cidades.
 * Renderiza no máximo MAX_VISIBLE itens por vez para performance.
 */
function CitySelect({
  cities,
  value,
  onChange,
  disabled,
}: {
  cities: string[];
  value: string;
  onChange: (city: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = search
    ? cities.filter(c => c.toLowerCase().includes(search.toLowerCase()))
    : cities;

  const visible = filtered.slice(0, MAX_VISIBLE);
  const hasMore = filtered.length > MAX_VISIBLE;

  // Fechar ao clicar fora
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focar no input ao abrir
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSelect = (city: string) => {
    onChange(city);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            setOpen(!open);
            setSearch("");
          }
        }}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          !value && "text-muted-foreground"
        )}
      >
        <span className="truncate">{value || "Selecione a cidade"}</span>
        <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          {/* Campo de busca */}
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar cidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Lista de cidades */}
          <div className="max-h-[240px] overflow-y-auto p-1">
            {visible.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Nenhuma cidade encontrada.
              </div>
            ) : (
              <>
                {visible.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => handleSelect(city)}
                    className={cn(
                      "flex w-full items-center rounded-sm px-2 py-1.5 text-sm cursor-default hover:bg-accent hover:text-accent-foreground",
                      value === city && "bg-accent"
                    )}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === city ? "opacity-100" : "opacity-0")} />
                    {city}
                  </button>
                ))}
                {hasMore && (
                  <div className="py-2 text-center text-xs text-muted-foreground">
                    +{filtered.length - MAX_VISIBLE} cidades — digite para filtrar
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const LocationCascade = ({ value, onChange }: LocationCascadeProps) => {
  // Buscar cidades do JSON estático
  const cities = value.state && value.country === "Brasil"
    ? (CITIES_BY_STATE as Record<string, string[]>)[value.state] || []
    : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* País */}
        <div className="space-y-2">
          <Label>País</Label>
          <Select
            value={value.country || undefined}
            onValueChange={(country) => onChange({ country, state: "", city: "", neighborhood: "" })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o país" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Brasil">Brasil</SelectItem>
              <SelectItem value="Portugal">Portugal</SelectItem>
              <SelectItem value="Estados Unidos">Estados Unidos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Estado */}
        <div className="space-y-2">
          <Label>Estado</Label>
          <Select
            value={value.state || undefined}
            onValueChange={(state) => onChange({ ...value, state, city: "", neighborhood: "" })}
            disabled={!value.country}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o estado" />
            </SelectTrigger>
            <SelectContent>
              {value.country === "Brasil" &&
                BRAZILIAN_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cidade */}
        <div className="space-y-2">
          <Label>Cidade</Label>
          <CitySelect
            cities={cities}
            value={value.city}
            onChange={(city) => onChange({ ...value, city, neighborhood: "" })}
            disabled={!value.state}
          />
        </div>

        {/* Bairro/Região */}
        <div className="space-y-2">
          <Label>Bairro/Região (opcional)</Label>
          <Input
            placeholder="Ex: Centro, Zona Sul..."
            value={value.neighborhood || ""}
            onChange={(e) => onChange({ ...value, neighborhood: e.target.value })}
            disabled={!value.city}
          />
        </div>
      </div>

      {/* Preview da localização */}
      {value.city && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-medium">
            {value.neighborhood && `${value.neighborhood}, `}
            {value.city}, {value.state} - {value.country}
          </span>
        </div>
      )}
    </div>
  );
};
