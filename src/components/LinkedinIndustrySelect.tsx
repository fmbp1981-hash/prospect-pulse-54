import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Check, X, Sparkles } from "lucide-react";
import { LINKEDIN_INDUSTRIES } from "@/data/linkedinIndustries";
import { cn } from "@/lib/utils";

interface LinkedinIndustrySelectProps {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}

/** Seletor de segmento/nicho/tipo de negócio (industryIds do LinkedIn) — mesmo
 * padrão visual do QuickSelectNiches, mas multi-seleção (várias badges). */
export const LinkedinIndustrySelect = ({ selectedIds, onChange }: LinkedinIndustrySelectProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const labelFor = (id: number) =>
    LINKEDIN_INDUSTRIES.flatMap((c) => c.industries).find((i) => i.id === id)?.label ?? String(id);

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id]);
  };

  const remove = (id: number) => onChange(selectedIds.filter((i) => i !== id));

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
          <Sparkles className="h-3 w-3 mr-1" />
          {isExpanded ? "Ocultar" : "Escolher segmento/nicho"}
        </Button>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 animate-fade-in">
          {selectedIds.map((id) => (
            <Badge key={id} variant="secondary" className="text-xs gap-1">
              <Check className="h-3 w-3" />
              {labelFor(id)}
              <button
                type="button"
                onClick={() => remove(id)}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                aria-label={`Remover ${labelFor(id)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {isExpanded && (
        <div className="p-4 border border-border rounded-lg bg-card/50 backdrop-blur-sm animate-fade-in">
          <Tabs defaultValue={LINKEDIN_INDUSTRIES[0].category} className="w-full">
            <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50">
              {LINKEDIN_INDUSTRIES.map((category) => (
                <TabsTrigger key={category.category} value={category.category} className="text-xs px-3 py-1.5">
                  {category.category}
                </TabsTrigger>
              ))}
            </TabsList>

            {LINKEDIN_INDUSTRIES.map((category) => (
              <TabsContent key={category.category} value={category.category} className="mt-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {category.industries.map((industry) => {
                    const isSelected = selectedIds.includes(industry.id);
                    return (
                      <Button
                        key={industry.id}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggle(industry.id)}
                        className={cn(
                          "justify-start text-xs h-auto py-2.5 px-3 transition-all hover:scale-102",
                          isSelected && "bg-primary text-primary-foreground shadow-card"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 mr-1.5 flex-shrink-0" />}
                        <span className="truncate">{industry.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
    </div>
  );
};
