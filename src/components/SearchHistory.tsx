import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Target, MapPin, Hash, Clock } from "lucide-react";
import { ProspectionSearch } from "@/types/prospection";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SearchHistoryProps {
  searches: ProspectionSearch[];
}

export const SearchHistory = ({ searches }: SearchHistoryProps) => {
  const getStatusColor = (status: ProspectionSearch['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-accent text-accent-foreground';
      case 'processing':
        return 'bg-primary text-primary-foreground';
      case 'error':
        return 'bg-destructive text-destructive-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const getStatusLabel = (status: ProspectionSearch['status']) => {
    switch (status) {
      case 'completed':
        return 'Concluída';
      case 'processing':
        return 'Processando';
      case 'error':
        return 'Erro';
      default:
        return 'Pendente';
    }
  };

  if (searches.length === 0) {
    return (
      <Card className="shadow-card animate-fade-in">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Histórico de Buscas
          </CardTitle>
          <CardDescription>
            Suas prospecções anteriores aparecerão aqui
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma prospecção realizada ainda</p>
            <p className="text-sm mt-2">Faça sua primeira busca acima</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card animate-fade-in">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          Histórico de Buscas
        </CardTitle>
        <CardDescription>
          {searches.length} {searches.length === 1 ? 'prospecção realizada' : 'prospecções realizadas'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {searches.map((search) => (
            <div
              key={search.id}
              className="border rounded-lg p-4 hover:border-primary/50 transition-all hover:shadow-card"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(search.status)}>
                    {getStatusLabel(search.status)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {format(new Date(search.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="font-medium">Nicho:</span>
                  <span className="text-muted-foreground">{search.niche}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="font-medium">Localização:</span>
                  <span className="text-muted-foreground">{search.location}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Hash className="h-4 w-4 text-primary" />
                  <span className="font-medium">Quantidade:</span>
                  <span className="text-muted-foreground">{search.quantity} leads</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
