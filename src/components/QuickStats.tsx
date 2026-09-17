import { useEffect, useState } from "react";
import { Users, Search, Database } from "lucide-react";
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

    const rows = [
        { icon: Users, label: "Total de Leads", value: stats.totalLeads, color: "text-primary" },
        { icon: Search, label: "Buscas Realizadas", value: stats.totalSearches, color: "text-accent" },
        { icon: Database, label: "Base de Dados", value: stats.totalSaved, color: "text-success" },
    ];

    if (loading) {
        return (
            <div className="divide-y divide-border rounded-2xl border border-border bg-background/60 backdrop-blur-sm">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-[68px] animate-pulse bg-muted/40" />
                ))}
            </div>
        );
    }

    return (
        <div className="divide-y divide-border rounded-2xl border border-border bg-background/60 backdrop-blur-sm">
            {rows.map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="flex items-center gap-4 px-5 py-4">
                    <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                    <span className="flex-1 text-sm text-muted-foreground">{label}</span>
                    <span className="text-2xl font-semibold tabular-nums text-foreground">
                        {value.toLocaleString()}
                    </span>
                </div>
            ))}
        </div>
    );
};
