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

    // Clear all history for user
    async clearHistory(): Promise<void> {
        const { error } = await (supabase
            .from('search_history')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000')); // Delete all rows where ID is not empty UUID (effectively all)

        if (error) {
            console.error('Error clearing history:', error);
            throw error;
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
    }
};
