import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";

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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* País */}
        <div className="space-y-2">
          <Label htmlFor="country">País</Label>
          <Select value={value.country} onValueChange={handleCountryChange}>
            <SelectTrigger id="country">
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
          <Label htmlFor="state">Estado</Label>
          <Select 
            value={value.state} 
            onValueChange={handleStateChange}
            disabled={!value.country || loadingStates}
          >
            <SelectTrigger id="state">
              {loadingStates ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Carregando...</span>
                </div>
              ) : (
                <SelectValue placeholder="Selecione o estado" />
              )}
            </SelectTrigger>
            <SelectContent>
              {states.map(state => (
                <SelectItem key={state.id} value={state.nome}>{state.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cidade */}
        <div className="space-y-2">
          <Label htmlFor="city">Cidade</Label>
          <Select 
            value={value.city} 
            onValueChange={handleCityChange}
            disabled={!value.state || loadingCities}
          >
            <SelectTrigger id="city">
              {loadingCities ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Carregando...</span>
                </div>
              ) : (
                <SelectValue placeholder="Selecione a cidade" />
              )}
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {cities.map(city => (
                <SelectItem key={city.id} value={city.nome}>{city.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
