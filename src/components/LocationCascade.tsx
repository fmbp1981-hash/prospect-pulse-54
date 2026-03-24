import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";

import type { LocationData as ProspectionLocationData } from "@/types/prospection";

export type LocationData = ProspectionLocationData;

interface LocationCascadeProps {
  value: LocationData;
  onChange: (location: LocationData) => void;
}

// Estados brasileiros (dados estáticos — não mudam)
const BRAZILIAN_STATES: ComboboxOption[] = [
  { value: "Acre", label: "Acre" },
  { value: "Alagoas", label: "Alagoas" },
  { value: "Amapá", label: "Amapá" },
  { value: "Amazonas", label: "Amazonas" },
  { value: "Bahia", label: "Bahia" },
  { value: "Ceará", label: "Ceará" },
  { value: "Distrito Federal", label: "Distrito Federal" },
  { value: "Espírito Santo", label: "Espírito Santo" },
  { value: "Goiás", label: "Goiás" },
  { value: "Maranhão", label: "Maranhão" },
  { value: "Mato Grosso", label: "Mato Grosso" },
  { value: "Mato Grosso do Sul", label: "Mato Grosso do Sul" },
  { value: "Minas Gerais", label: "Minas Gerais" },
  { value: "Pará", label: "Pará" },
  { value: "Paraíba", label: "Paraíba" },
  { value: "Paraná", label: "Paraná" },
  { value: "Pernambuco", label: "Pernambuco" },
  { value: "Piauí", label: "Piauí" },
  { value: "Rio de Janeiro", label: "Rio de Janeiro" },
  { value: "Rio Grande do Norte", label: "Rio Grande do Norte" },
  { value: "Rio Grande do Sul", label: "Rio Grande do Sul" },
  { value: "Rondônia", label: "Rondônia" },
  { value: "Roraima", label: "Roraima" },
  { value: "Santa Catarina", label: "Santa Catarina" },
  { value: "São Paulo", label: "São Paulo" },
  { value: "Sergipe", label: "Sergipe" },
  { value: "Tocantins", label: "Tocantins" },
];

// Mapeamento nome do estado → ID IBGE (para buscar cidades)
const STATE_IBGE_IDS: Record<string, number> = {
  "Acre": 12, "Alagoas": 27, "Amapá": 16, "Amazonas": 13,
  "Bahia": 29, "Ceará": 23, "Distrito Federal": 53, "Espírito Santo": 32,
  "Goiás": 52, "Maranhão": 21, "Mato Grosso": 51, "Mato Grosso do Sul": 50,
  "Minas Gerais": 31, "Pará": 15, "Paraíba": 25, "Paraná": 41,
  "Pernambuco": 26, "Piauí": 22, "Rio de Janeiro": 33, "Rio Grande do Norte": 24,
  "Rio Grande do Sul": 43, "Rondônia": 11, "Roraima": 14, "Santa Catarina": 42,
  "São Paulo": 35, "Sergipe": 28, "Tocantins": 17,
};

export const LocationCascade = ({ value, onChange }: LocationCascadeProps) => {
  const [cityNames, setCityNames] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);

  // Buscar cidades quando estado muda (via IBGE API)
  useEffect(() => {
    const controller = new AbortController();

    if (value.state && value.country === "Brasil") {
      const stateId = STATE_IBGE_IDS[value.state];
      if (stateId) {
        setLoadingCities(true);
        fetch(
          `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${stateId}/municipios?orderBy=nome`,
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

  const handleCountryChange = (country: string) => {
    onChange({ country, state: "", city: "", neighborhood: "" });
  };

  const handleStateChange = (state: string) => {
    onChange({ ...value, state, city: "", neighborhood: "" });
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, city: e.target.value, neighborhood: "" });
  };

  const handleNeighborhoodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, neighborhood: e.target.value });
  };

  const countryOptions: ComboboxOption[] = [
    { value: "Brasil", label: "Brasil" },
    { value: "Portugal", label: "Portugal" },
    { value: "Estados Unidos", label: "Estados Unidos" },
  ];

  const stateOptions: ComboboxOption[] =
    value.country === "Brasil" ? BRAZILIAN_STATES : [];

  const datalistId = `cities-${value.state?.replace(/\s/g, "-") || "none"}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* País */}
        <div className="space-y-2">
          <Label htmlFor="country">País</Label>
          <Combobox
            options={countryOptions}
            value={value.country}
            onValueChange={handleCountryChange}
            placeholder="Selecione o país"
            searchPlaceholder="Digite para buscar país..."
            emptyMessage="Nenhum país encontrado."
          />
        </div>

        {/* Estado */}
        <div className="space-y-2">
          <Label htmlFor="state">Estado</Label>
          <Combobox
            options={stateOptions}
            value={value.state}
            onValueChange={handleStateChange}
            placeholder="Selecione o estado"
            searchPlaceholder="Digite para buscar estado..."
            emptyMessage="Nenhum estado encontrado."
            disabled={!value.country || stateOptions.length === 0}
          />
        </div>

        {/* Cidade — Input com datalist nativo (autocomplete do browser) */}
        <div className="space-y-2">
          <Label htmlFor="city" className="flex items-center gap-2">
            Cidade
            {loadingCities && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </Label>
          <Input
            id="city"
            list={datalistId}
            placeholder={loadingCities ? "Carregando cidades..." : "Digite a cidade"}
            value={value.city}
            onChange={handleCityChange}
            disabled={!value.state}
            autoComplete="off"
          />
          {cityNames.length > 0 && (
            <datalist id={datalistId}>
              {cityNames.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
          )}
        </div>

        {/* Bairro/Região */}
        <div className="space-y-2">
          <Label htmlFor="neighborhood">Bairro/Região (opcional)</Label>
          <Input
            id="neighborhood"
            placeholder="Ex: Centro, Zona Sul..."
            value={value.neighborhood || ""}
            onChange={handleNeighborhoodChange}
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
