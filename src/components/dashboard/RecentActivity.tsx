import { DashboardMetrics } from "@/types/prospection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RecentActivityProps {
  metrics: DashboardMetrics;
}

export const RecentActivity = ({ metrics }: RecentActivityProps) => {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Clock className="h-4 w-4 text-accent" />
          </div>
          <CardTitle>Próximos Follow-ups</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {metrics.proximosFollowUps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhum follow-up agendado
            </div>
          ) : (
            metrics.proximosFollowUps.map((followup) => (
              <div
                key={followup.leadId}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
                  <Calendar className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{followup.leadName}</p>
                  <p className="text-xs text-muted-foreground truncate">{followup.empresa}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {format(new Date(followup.data), "dd MMM", { locale: ptBR })}
                    </Badge>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
