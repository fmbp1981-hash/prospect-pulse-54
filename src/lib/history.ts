import { supabase } from "@/integrations/supabase/client";
import { ProspectionSearch, LocationData } from "@/types/prospection";
import type { Database } from "@/integrations/supabase/types";

export interface SearchHistoryItem {
    id: string;
    user_id: string;
    niche: string;
    location: LocationData;
    quantity: number;
    status: 'pending' | 'processing' | 'completed' | 'error';
    saved_count: number;
    created_at: string;
}

export const historyService = {
    // Fetch history from Supabase
    async getHistory(): Promise<ProspectionSearch[]> {
        // Cast to any to bypass type check for new table
        const { data, error } = await (supabase
            .from('search_history')
            .select('*')
            .order('created_at', { ascending: false }));

        if (error) {
            console.error('Error fetching history:', error);
            throw error;
        }

        return (data || []).map((item: any) => ({
            id: item.id,
            niche: item.niche,
            location: item.location as LocationData,
            quantity: item.quantity,
            timestamp: new Date(item.created_at),
            status: item.status as any,
            savedCount: item.saved_count
        }));
    },

    // Save new search to Supabase
    async saveSearch(search: Omit<ProspectionSearch, 'id' | 'timestamp'> & { user_id?: string }): Promise<ProspectionSearch> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
            .from('search_history')
            .insert({
                niche: search.niche,
                location: search.location, // Supabase handles JSONB automatically
                quantity: search.quantity,
                status: search.status,
                saved_count: search.savedCount || 0,
                user_id: search.user_id || (await supabase.auth.getUser()).data.user?.id
            })
            .select()
            .single();

        if (error) {
            console.error('Error saving search:', error);
            throw error;
        }

        const row = data as any;

        return {
            id: row.id,
            niche: row.niche,
            location: row.location as LocationData,
            quantity: row.quantity,
            timestamp: new Date(row.created_at),
            status: row.status as any,
            savedCount: row.saved_count
        };
    },

    // Clear all history for user — a lista exibida é unificada (GMN +
    // LinkedIn), mas cada canal mora numa tabela diferente (search_history vs
    // prospecting_jobs). Apagar só uma faz o outro canal "voltar" no próximo
    // carregamento — por isso as duas chamadas abaixo são obrigatórias juntas.
    async clearHistory(): Promise<void> {
        const [gmnResult, linkedinResult] = await Promise.allSettled([
            supabase
                .from('search_history')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'), // Delete all rows where ID is not empty UUID (effectively all)
            fetch('/api/prospecting/linkedin/history', { method: 'DELETE' }),
        ]);

        if (gmnResult.status === 'fulfilled' && gmnResult.value.error) {
            console.error('Error clearing GMN history:', gmnResult.value.error);
            throw gmnResult.value.error;
        }
        if (gmnResult.status === 'rejected') {
            console.error('Error clearing GMN history:', gmnResult.reason);
            throw gmnResult.reason;
        }

        if (linkedinResult.status === 'rejected') {
            console.error('Error clearing LinkedIn history:', linkedinResult.reason);
            throw linkedinResult.reason;
        }
        if (linkedinResult.status === 'fulfilled' && !linkedinResult.value.ok) {
            const body = await linkedinResult.value.json().catch(() => null);
            console.error('Error clearing LinkedIn history:', body);
            throw new Error(typeof body?.error === 'string' ? body.error : 'Erro ao apagar histórico do LinkedIn');
        }
    },

    // Delete single item
    async deleteSearch(id: string): Promise<void> {
        const { error } = await (supabase
            .from('search_history')
            .delete()
            .eq('id', id));

        if (error) {
            console.error('Error deleting search:', error);
            throw error;
        }
    },

    // Fetch LinkedIn prospecting job history (prospecting_jobs), unificado com o histórico GMN
    async getLinkedinHistory(): Promise<ProspectionSearch[]> {
        const res = await fetch('/api/prospecting/linkedin/history');
        if (!res.ok) {
            throw new Error('Falha ao carregar histórico do LinkedIn');
        }

        const json: { data?: LinkedinHistoryApiItem[] } = await res.json();
        const items: LinkedinHistoryApiItem[] = json.data ?? [];

        return items.map((item): ProspectionSearch => ({
            id: item.id,
            channel: 'linkedin',
            niche: item.searchQuery,
            location: { country: "", state: "", city: item.locations.join(', ') || "—", neighborhood: "" },
            quantity: item.quantity,
            timestamp: new Date(item.createdAt),
            status: item.status,
            savedCount: item.created,
            linkedinJobId: item.id,
            linkedinSummary: {
                found: item.found,
                created: item.created,
                skippedDuplicate: item.skippedDuplicate,
                skippedSuppressed: item.skippedSuppressed,
            },
        }));
    }
};

interface LinkedinHistoryApiItem {
    id: string;
    searchQuery: string;
    locations: string[];
    quantity: number;
    status: 'pending' | 'processing' | 'completed' | 'error';
    found: number;
    created: number;
    skippedDuplicate: number;
    skippedSuppressed: number;
    createdAt: string;
}
