import { supabase } from "@/integrations/supabase/client";
import { ProspectionSearch, LocationData } from "@/types/prospection";

type SearchHistoryRow = {
    id: string;
    niche: string;
    location: LocationData;
    quantity: number;
    status: ProspectionSearch['status'];
    saved_count: number;
    created_at: string;
};

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
        // A tabela `search_history` pode não existir no types gerado; forçamos apenas o tipo (sem alterar o valor runtime).
        const { data, error } = await supabase
            .from('search_history' as unknown as 'leads_prospeccao')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching history:', error);
            throw error;
        }

        const rows = (data || []) as unknown as SearchHistoryRow[];

        return rows.map((item) => ({
            id: item.id,
            niche: item.niche,
            location: item.location,
            quantity: item.quantity,
            timestamp: new Date(item.created_at),
            status: item.status,
            savedCount: item.saved_count,
        }));
    },

    // Save new search to Supabase
    async saveSearch(search: Omit<ProspectionSearch, 'id' | 'timestamp'> & { user_id?: string }): Promise<ProspectionSearch> {
        const { data, error } = await supabase
            .from('search_history' as unknown as 'leads_prospeccao')
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

        const row = data as unknown as SearchHistoryRow;

        return {
            id: row.id,
            niche: row.niche,
            location: row.location,
            quantity: row.quantity,
            timestamp: new Date(row.created_at),
            status: row.status,
            savedCount: row.saved_count
        };
    },

    // Clear all history for user
    async clearHistory(): Promise<void> {
        const { error } = await supabase
            .from('search_history' as unknown as 'leads_prospeccao')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows where ID is not empty UUID (effectively all)

        if (error) {
            console.error('Error clearing history:', error);
            throw error;
        }
    },

    // Delete single item
    async deleteSearch(id: string): Promise<void> {
        const { error } = await supabase
            .from('search_history' as unknown as 'leads_prospeccao')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting search:', error);
            throw error;
        }
    },

    // Update search status and saved count
    async updateSearch(id: string, updates: { status?: ProspectionSearch['status']; saved_count?: number }): Promise<void> {
        const { error } = await supabase
            .from('search_history' as unknown as 'leads_prospeccao')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error('Error updating search:', error);
            throw error;
        }
    }
};
