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

interface IBGECity {
  id: number;
  nome: string;
}

export const LocationCascade = ({ value, onChange }: LocationCascadeProps) => {
  const [cities, setCities] = useState<IBGECity[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [stateSearch, setStateSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");

  // Buscar cidades quando estado muda
  useEffect(() => {
    const controller = new AbortController();

    if (value.state && value.country === "Brasil") {
      const selectedState = BRAZILIAN_STATES.find(s => s.nome === value.state);
      if (selectedState) {
        setLoadingCities(true);
        setCities([]);
        setCitySearch("");
        fetch(
          `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${selectedState.id}/municipios?orderBy=nome`,
          { signal: controller.signal }
        )
          .then(res => res.json())
          .then((data: IBGECity[]) => {
            setCities(data);
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
      setCities([]);
      setLoadingCities(false);
    }

    return () => controller.abort();
  }, [value.state, value.country]);

  const filteredStates = stateSearch
    ? BRAZILIAN_STATES.filter(s => s.nome.toLowerCase().includes(stateSearch.toLowerCase()))
    : BRAZILIAN_STATES;

  const filteredCities = citySearch
    ? cities.filter(c => c.nome.toLowerCase().includes(citySearch.toLowerCase()))
    : cities;

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
            onValueChange={(state) => {
              onChange({ ...value, state, city: "", neighborhood: "" });
              setStateSearch("");
            }}
            disabled={!value.country}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o estado" />
            </SelectTrigger>
            <SelectContent>
              <div className="flex items-center border-b px-2 pb-2 mb-1">
                <Search className="h-4 w-4 shrink-0 opacity-50 mr-2" />
                <input
                  placeholder="Filtrar estado..."
                  value={stateSearch}
                  onChange={(e) => setStateSearch(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              {value.country === "Brasil" &&
                filteredStates.map((state) => (
                  <SelectItem key={state.id} value={state.nome}>
                    {state.nome}
                  </SelectItem>
                ))}
              {value.country === "Brasil" && filteredStates.length === 0 && (
                <div className="py-2 text-center text-sm text-muted-foreground">
                  Nenhum estado encontrado.
                </div>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Cidade */}
        <div className="space-y-2">
          <Label>Cidade</Label>
          {loadingCities ? (
            <div className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
              Carregando cidades...
            </div>
          ) : (
            <Select
              value={value.city || undefined}
              onValueChange={(city) => {
                onChange({ ...value, city, neighborhood: "" });
                setCitySearch("");
              }}
              disabled={!value.state || loadingCities}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a cidade" />
              </SelectTrigger>
              <SelectContent>
                <div className="flex items-center border-b px-2 pb-2 mb-1">
                  <Search className="h-4 w-4 shrink-0 opacity-50 mr-2" />
                  <input
                    placeholder="Filtrar cidade..."
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                {filteredCities.map((city) => (
                  <SelectItem key={city.id} value={city.nome}>
                    {city.nome}
                  </SelectItem>
                ))}
                {filteredCities.length === 0 && citySearch && (
                  <div className="py-2 text-center text-sm text-muted-foreground">
                    Nenhuma cidade encontrada.
                  </div>
                )}
              </SelectContent>
            </Select>
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
