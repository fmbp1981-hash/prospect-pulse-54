import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

import type { LocationData as ProspectionLocationData } from "@/types/prospection";

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

// Mapeamento nome do estado → ID IBGE
const STATE_IBGE_IDS: Record<string, number> = {
  "Acre": 12, "Alagoas": 27, "Amapá": 16, "Amazonas": 13,
  "Bahia": 29, "Ceará": 23, "Distrito Federal": 53, "Espírito Santo": 32,
  "Goiás": 52, "Maranhão": 21, "Mato Grosso": 51, "Mato Grosso do Sul": 50,
  "Minas Gerais": 31, "Pará": 15, "Paraíba": 25, "Paraná": 41,
  "Pernambuco": 26, "Piauí": 22, "Rio de Janeiro": 33, "Rio Grande do Norte": 24,
  "Rio Grande do Sul": 43, "Rondônia": 11, "Roraima": 14, "Santa Catarina": 42,
  "São Paulo": 35, "Sergipe": 28, "Tocantins": 17,
};

// Componente Select nativo com busca
function NativeSelect({
  id,
  options,
  value,
  onChange,
  placeholder,
  disabled,
  loading,
}: {
  id: string;
  options: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || loading}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">{loading ? "Carregando..." : placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

export const LocationCascade = ({ value, onChange }: LocationCascadeProps) => {
  const [cityNames, setCityNames] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);

  // Buscar cidades quando estado muda
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* País */}
        <div className="space-y-2">
          <Label htmlFor="country">País</Label>
          <NativeSelect
            id="country"
            options={["Brasil", "Portugal", "Estados Unidos"]}
            value={value.country}
            onChange={(country) => onChange({ country, state: "", city: "", neighborhood: "" })}
            placeholder="Selecione o país"
          />
        </div>

        {/* Estado */}
        <div className="space-y-2">
          <Label htmlFor="state">Estado</Label>
          <NativeSelect
            id="state"
            options={value.country === "Brasil" ? BRAZILIAN_STATES : []}
            value={value.state}
            onChange={(state) => onChange({ ...value, state, city: "", neighborhood: "" })}
            placeholder="Selecione o estado"
            disabled={!value.country}
          />
        </div>

        {/* Cidade */}
        <div className="space-y-2">
          <Label htmlFor="city">Cidade</Label>
          <NativeSelect
            id="city"
            options={cityNames}
            value={value.city}
            onChange={(city) => onChange({ ...value, city, neighborhood: "" })}
            placeholder="Selecione a cidade"
            disabled={!value.state}
            loading={loadingCities}
          />
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
