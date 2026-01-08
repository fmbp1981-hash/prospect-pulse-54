import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Note {
    id: string;
    content: string;
    created_at: string;
    user_id: string;
}

export interface Interaction {
    id: string;
    type: 'status_change' | 'whatsapp_sent' | 'note_added' | 'manual_log';
    description: string;
    metadata: any;
    created_at: string;
    user_id: string;
}

export function useLeadDetails(leadId: string | undefined) {
    const [notes, setNotes] = useState<Note[]>([]);
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (leadId) {
            loadDetails();
        }
    }, [leadId]);

    const loadDetails = async () => {
        if (!leadId) return;
        setIsLoading(true);
        try {
            // Load Notes
            const { data: notesData } = await (supabase
                .from("lead_notes") as any)
                .select("*")
                .eq("lead_id", leadId)
                .order("created_at", { ascending: false });

            if (notesData) setNotes(notesData);

            // Load Interactions
            const { interactionsData } = await (supabase
                .from("lead_interactions") as any)
                .select("*")
                .eq("lead_id", leadId)
                .order("created_at", { ascending: false }) as any;

            if (interactionsData) setInteractions(interactionsData);

            // Load Tags (from lead table)
            const { data: leadData } = await (supabase
                .from("leads_prospeccao") as any)
                .select("tags")
                .eq("id", leadId)
                .single();

            if (leadData) setTags(leadData.tags || []);

        } catch (error) {
            console.error("Error loading details:", error);
            toast.error("Erro ao carregar detalhes do lead");
        } finally {
            setIsLoading(false);
        }
    };

    const addNote = async (content: string) => {
        if (!leadId) return;
        try {
            const { error } = await (supabase
                .from("lead_notes") as any)
                .insert([{ lead_id: leadId, content }]);

            if (error) throw error;

            // Log interaction
            await logInteraction('note_added', 'Adicionou uma anotação');

            toast.success("Nota adicionada!");
            loadDetails();
        } catch (error) {
            console.error("Error adding note:", error);
            toast.error("Erro ao adicionar nota");
        }
    };

    const addTag = async (tag: string) => {
        if (!leadId) return;
        const newTags = [...tags, tag];
        try {
            const { error } = await (supabase
                .from("leads_prospeccao") as any)
                .update({ tags: newTags })
                .eq("id", leadId);

            if (error) throw error;

            setTags(newTags);
            toast.success("Tag adicionada!");
        } catch (error) {
            console.error("Error adding tag:", error);
            toast.error("Erro ao adicionar tag");
        }
    };

    const removeTag = async (tagToRemove: string) => {
        if (!leadId) return;
        const newTags = tags.filter(t => t !== tagToRemove);
        try {
            const { error } = await (supabase
                .from("leads_prospeccao") as any)
                .update({ tags: newTags })
                .eq("id", leadId);

            if (error) throw error;

            setTags(newTags);
            toast.success("Tag removida!");
        } catch (error) {
            console.error("Error removing tag:", error);
            toast.error("Erro ao remover tag");
        }
    };

    const logInteraction = async (type: Interaction['type'], description: string, metadata = {}) => {
        if (!leadId) return;
        try {
            await (supabase
                .from("lead_interactions") as any)
                .insert([{
                    lead_id: leadId,
                    type,
                    description,
                    metadata
                }]);

            // Refresh interactions if needed, or let next load handle it
        } catch (error) {
            console.error("Error logging interaction:", error);
        }
    };

    return {
        notes,
        interactions,
        tags,
        isLoading,
        addNote,
        addTag,
        removeTag,
        refresh: loadDetails
    };
}
