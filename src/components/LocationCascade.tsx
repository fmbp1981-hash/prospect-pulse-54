import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MapPin, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { LocationData as ProspectionLocationData } from "@/types/prospection";

export type LocationData = ProspectionLocationData;

interface LocationCascadeProps {
  value: LocationData;
  onChange: (location: LocationData) => void;
}

// Estados brasileiros com IDs IBGE
const BRAZILIAN_STATES = [
  { id: 12, nome: "Acre" }, { id: 27, nome: "Alagoas" }, { id: 16, nome: "Amapá" },
  { id: 13, nome: "Amazonas" }, { id: 29, nome: "Bahia" }, { id: 23, nome: "Ceará" },
  { id: 53, nome: "Distrito Federal" }, { id: 32, nome: "Espírito Santo" },
  { id: 52, nome: "Goiás" }, { id: 21, nome: "Maranhão" }, { id: 51, nome: "Mato Grosso" },
  { id: 50, nome: "Mato Grosso do Sul" }, { id: 31, nome: "Minas Gerais" },
  { id: 15, nome: "Pará" }, { id: 25, nome: "Paraíba" }, { id: 41, nome: "Paraná" },
  { id: 26, nome: "Pernambuco" }, { id: 22, nome: "Piauí" }, { id: 33, nome: "Rio de Janeiro" },
  { id: 24, nome: "Rio Grande do Norte" }, { id: 43, nome: "Rio Grande do Sul" },
  { id: 11, nome: "Rondônia" }, { id: 14, nome: "Roraima" }, { id: 42, nome: "Santa Catarina" },
  { id: 35, nome: "São Paulo" }, { id: 28, nome: "Sergipe" }, { id: 17, nome: "Tocantins" },
];

export const LocationCascade = ({ value, onChange }: LocationCascadeProps) => {
  const [cityNames, setCityNames] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [cityFilter, setCityFilter] = useState("");

  // Buscar cidades quando estado muda
  useEffect(() => {
    const controller = new AbortController();

    if (value.state && value.country === "Brasil") {
      const selectedState = BRAZILIAN_STATES.find(s => s.nome === value.state);
      if (selectedState) {
        setLoadingCities(true);
        setCityNames([]);
        setCityFilter("");
        fetch(
          `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${selectedState.id}/municipios?orderBy=nome`,
          { signal: controller.signal }
        )
          .then(res => res.json())
          .then((data: Array<{ nome: string }>) => {
            setCityNames(data.map(c => c.nome));
            setLoadingCities(false);
          })
          .catch(error => {
            if (error.name !== "AbortError") {
              console.error("Error fetching cities:", error);
              setLoadingCities(false);
            }
          });
      }
    } else {
      setCityNames([]);
      setLoadingCities(false);
    }

    return () => controller.abort();
  }, [value.state, value.country]);

  const filteredCities = cityFilter
    ? cityNames.filter(name => name.toLowerCase().includes(cityFilter.toLowerCase()))
    : cityNames;

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
                  <SelectItem key={state.id} value={state.nome}>
                    {state.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cidade */}
        <div className="space-y-2">
          <Label>Cidade {loadingCities && <span className="text-muted-foreground text-xs">(carregando...)</span>}</Label>
          {/* Filtro de busca acima do dropdown */}
          {cityNames.length > 0 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar cidade..."
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
            </div>
          )}
          <select
            value={value.city}
            onChange={(e) => {
              onChange({ ...value, city: e.target.value, neighborhood: "" });
              setCityFilter("");
            }}
            disabled={!value.state || loadingCities}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">
              {loadingCities ? "Carregando cidades..." : "Selecione a cidade"}
            </option>
            {filteredCities.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {cityFilter && filteredCities.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma cidade encontrada para "{cityFilter}"</p>
          )}
        </div>

        {/* Bairro/Região */}
        <div className="space-y-2">
          <Label htmlFor="neighborhood">Bairro/Região (opcional)</Label>
          <Input
            id="neighborhood"
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
