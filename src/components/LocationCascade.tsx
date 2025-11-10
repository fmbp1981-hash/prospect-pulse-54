import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";

export interface LocationData {
  country: string;
  state: string;
  city: string;
  neighborhood?: string;
}

interface LocationCascadeProps {
  value: LocationData;
  onChange: (location: LocationData) => void;
}

interface IBGEState {
  id: number;
  sigla: string;
  nome: string;
}

interface IBGECity {
  id: number;
  nome: string;
}

export const LocationCascade = ({ value, onChange }: LocationCascadeProps) => {
  const [states, setStates] = useState<IBGEState[]>([]);
  const [cities, setCities] = useState<IBGECity[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  // Buscar estados quando país for Brasil
  useEffect(() => {
    if (value.country === "Brasil") {
      setLoadingStates(true);
      fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome")
        .then(res => res.json())
        .then((data: IBGEState[]) => {
          setStates(data);
          setLoadingStates(false);
        })
        .catch(error => {
          console.error("Error fetching states:", error);
          setLoadingStates(false);
        });
    } else {
      setStates([]);
    }
  }, [value.country]);

  // Buscar cidades quando estado muda
  useEffect(() => {
    if (value.state && value.country === "Brasil") {
      const selectedState = states.find(s => s.nome === value.state);
      if (selectedState) {
        setLoadingCities(true);
        fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${selectedState.id}/municipios?orderBy=nome`)
          .then(res => res.json())
          .then((data: IBGECity[]) => {
            setCities(data);
            setLoadingCities(false);
          })
          .catch(error => {
            console.error("Error fetching cities:", error);
            setLoadingCities(false);
          });
      }
    } else {
      setCities([]);
    }
  }, [value.state, value.country, states]);

  const handleCountryChange = (country: string) => {
    onChange({ country, state: "", city: "", neighborhood: "" });
  };

  const handleStateChange = (state: string) => {
    onChange({ ...value, state, city: "", neighborhood: "" });
  };

  const handleCityChange = (city: string) => {
    onChange({ ...value, city, neighborhood: "" });
  };

  const handleNeighborhoodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, neighborhood: e.target.value });
  };

  // Preparar opções para os Combobox
  const countryOptions: ComboboxOption[] = [
    { value: "Brasil", label: "Brasil" },
    { value: "Portugal", label: "Portugal" },
    { value: "Estados Unidos", label: "Estados Unidos" },
  ];

  const stateOptions: ComboboxOption[] = states.map(state => ({
    value: state.nome,
    label: state.nome,
  }));

  const cityOptions: ComboboxOption[] = cities.map(city => ({
    value: city.nome,
    label: city.nome,
  }));

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
            disabled={!value.country}
            loading={loadingStates}
          />
        </div>

        {/* Cidade */}
        <div className="space-y-2">
          <Label htmlFor="city">Cidade</Label>
          <Combobox
            options={cityOptions}
            value={value.city}
            onValueChange={handleCityChange}
            placeholder="Selecione a cidade"
            searchPlaceholder="Digite para buscar cidade..."
            emptyMessage="Nenhuma cidade encontrada."
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
