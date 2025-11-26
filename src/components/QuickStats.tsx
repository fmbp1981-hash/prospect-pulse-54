import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Search, TrendingUp, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const QuickStats = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState({
        totalLeads: 0,
        totalSearches: 0,
        inNegotiation: 0,
        conversionRate: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            if (!user) return;

            try {
                // Fetch total leads (only head for count)
                const { count: leadsCount } = await supabase
                    .from('leads_prospeccao')
                    .select('*', { count: 'exact', head: true });

                // Fetch total searches
                const { count: searchesCount } = await supabase
                    .from('search_history')
                    .select('*', { count: 'exact', head: true });

                // Fetch leads in negotiation
                const { count: inNegotiationCount } = await supabase
                    .from('leads_prospeccao')
                    .select('*', { count: 'exact', head: true })
                    .in('status', ['Negociação', 'Proposta Enviada']);

                // Fetch closed won leads
                const { count: closedCount } = await supabase
                    .from('leads_prospeccao')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'Fechado');

                // Calculate conversion rate
                const conversionRate = leadsCount && leadsCount > 0
                    ? ((closedCount || 0) / leadsCount) * 100
                    : 0;

                setStats({
                    totalLeads: leadsCount || 0,
                    totalSearches: searchesCount || 0,
                    inNegotiation: inNegotiationCount || 0,
                    conversionRate: Math.round(conversionRate * 10) / 10 // Round to 1 decimal
                });
            } catch (error) {
                console.error("Error fetching stats:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [user]);

    if (loading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-fade-in">
            <Card className="bg-primary/5 border-primary/10 shadow-sm hover:shadow-md transition-all">
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <Users className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total de Leads</p>
                        <h3 className="text-2xl font-bold text-foreground">{stats.totalLeads.toLocaleString()}</h3>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-accent/5 border-accent/10 shadow-sm hover:shadow-md transition-all">
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                        <Search className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Prospecções</p>
                        <h3 className="text-2xl font-bold text-foreground">{stats.totalSearches.toLocaleString()}</h3>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-warning/5 border-warning/10 shadow-sm hover:shadow-md transition-all">
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center text-warning">
                        <Target className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Em Negociação</p>
                        <h3 className="text-2xl font-bold text-foreground">{stats.inNegotiation.toLocaleString()}</h3>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-success/5 border-success/10 shadow-sm hover:shadow-md transition-all">
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success">
                        <TrendingUp className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Taxa de Conversão</p>
                        <h3 className="text-2xl font-bold text-foreground">{stats.conversionRate}%</h3>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
