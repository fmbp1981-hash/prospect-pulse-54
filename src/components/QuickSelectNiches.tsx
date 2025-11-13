import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Check, X, Sparkles } from "lucide-react";
import { QUICK_NICHES } from "@/data/prospectionQuickSelects";
import { cn } from "@/lib/utils";

interface QuickSelectNichesProps {
  selectedNiche: string;
  onSelect: (niche: string) => void;
}

export const QuickSelectNiches = ({ selectedNiche, onSelect }: QuickSelectNichesProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSelect = (niche: string) => {
    onSelect(niche);
    
    // Auto-recolher após 400ms para dar feedback visual
    setTimeout(() => {
      setIsExpanded(false);
    }, 400);
  };

  const handleClear = () => {
    onSelect("");
  };

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
          {isExpanded ? "Ocultar" : "Seleção Rápida"}
        </Button>
        
        {selectedNiche && (
          <Badge variant="secondary" className="text-xs gap-1 animate-fade-in">
            <Check className="h-3 w-3" />
            {selectedNiche}
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
        <div className="p-4 border border-border rounded-lg bg-card/50 backdrop-blur-sm animate-fade-in">
          <Tabs defaultValue={QUICK_NICHES[0].category} className="w-full">
            <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50">
              {QUICK_NICHES.map((category) => (
                <TabsTrigger
                  key={category.category}
                  value={category.category}
                  className="text-xs px-3 py-1.5"
                >
                  {category.category}
                </TabsTrigger>
              ))}
            </TabsList>

            {QUICK_NICHES.map((category) => (
              <TabsContent
                key={category.category}
                value={category.category}
                className="mt-4"
              >
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {category.niches.map((niche) => {
                    const isSelected = selectedNiche === niche;
                    return (
                      <Button
                        key={niche}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleSelect(niche)}
                        className={cn(
                          "justify-start text-xs h-auto py-2.5 px-3 transition-all hover:scale-102",
                          isSelected && "bg-primary text-primary-foreground shadow-card"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 mr-1.5 flex-shrink-0" />}
                        <span className="truncate">{niche}</span>
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
