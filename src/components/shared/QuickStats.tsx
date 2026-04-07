import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Search, TrendingUp, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const QuickStats = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState({
        totalLeads: 0,
        totalSearches: 0,
        totalSaved: 0
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

                setStats({
                    totalLeads: leadsCount || 0,
                    totalSearches: searchesCount || 0,
                    totalSaved: leadsCount || 0 // Assuming all leads in DB are "saved"
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8 animate-fade-in">
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
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Buscas Realizadas</p>
                        <h3 className="text-2xl font-bold text-foreground">{stats.totalSearches.toLocaleString()}</h3>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-success/5 border-success/10 shadow-sm hover:shadow-md transition-all hidden md:block">
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success">
                        <Database className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Base de Dados</p>
                        <h3 className="text-2xl font-bold text-foreground">{stats.totalSaved.toLocaleString()}</h3>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
