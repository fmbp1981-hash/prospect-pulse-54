import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Check, X, MapPin, ChevronDown } from "lucide-react";
import { QUICK_LOCATIONS } from "@/data/prospectionQuickSelects";
import { LocationData } from "@/types/prospection";
import { cn } from "@/lib/utils";

interface QuickSelectLocationsProps {
  selectedLocation?: LocationData;
  onSelect: (location: LocationData) => void;
}

export const QuickSelectLocations = ({ selectedLocation, onSelect }: QuickSelectLocationsProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [openRegions, setOpenRegions] = useState<string[]>([]);

  const handleSelect = (location: { city: string; state: string; country: string }) => {
    onSelect({
      city: location.city,
      state: location.state,
      country: location.country,
      neighborhood: ""
    });
  };

  const handleClear = () => {
    onSelect({
      country: "",
      state: "",
      city: "",
      neighborhood: ""
    });
  };

  const toggleRegion = (region: string) => {
    setOpenRegions((prev) =>
      prev.includes(region)
        ? prev.filter((r) => r !== region)
        : [...prev, region]
    );
  };

  const isLocationSelected = (city: string, state: string) => {
    return selectedLocation?.city === city && selectedLocation?.state === state;
  };

  const selectedLocationLabel = selectedLocation?.city && selectedLocation?.state
    ? `${selectedLocation.city}, ${selectedLocation.state}`
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs"
        >
          <MapPin className="h-3 w-3 mr-1" />
          {isExpanded ? "Ocultar" : "Cidades Populares"}
        </Button>

        {selectedLocationLabel && (
          <Badge variant="secondary" className="text-xs gap-1 animate-fade-in">
            <Check className="h-3 w-3" />
            {selectedLocationLabel}
            <button
              type="button"
              onClick={handleClear}
              className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
      </div>

      {isExpanded && (
        <div className="p-4 border border-border rounded-lg bg-card/50 backdrop-blur-sm animate-fade-in space-y-2">
          {QUICK_LOCATIONS.map((regionData) => {
            const isOpen = openRegions.includes(regionData.region);
            
            return (
              <Collapsible
                key={regionData.region}
                open={isOpen}
                onOpenChange={() => toggleRegion(regionData.region)}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between text-sm font-semibold hover:bg-accent/50"
                  >
                    <span className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      {regionData.region}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
                
                <CollapsibleContent className="mt-2">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pl-6">
                    {regionData.locations.map((location) => {
                      const isSelected = isLocationSelected(location.city, location.state);
                      
                      return (
                        <Button
                          key={`${location.city}-${location.state}`}
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleSelect(location)}
                          className={cn(
                            "justify-start text-xs h-auto py-2.5 px-3 transition-all hover:scale-102",
                            isSelected && "bg-primary text-primary-foreground shadow-card"
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3 mr-1.5 flex-shrink-0" />}
                          <span className="truncate">
                            {location.city}, {location.state}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
};
