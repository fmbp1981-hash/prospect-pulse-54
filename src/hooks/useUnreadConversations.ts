'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'inbox_last_visit_at';

function getLastVisit(): string {
  if (typeof window === 'undefined') return new Date().toISOString();
  // Default to "now" for first-time visitors so historical records don't show as unread
  return localStorage.getItem(STORAGE_KEY) || new Date().toISOString();
}

/**
 * Tracks the number of conversations (distinct lead_ids) with new activity
 * since the user last opened the Inbox page.
 * Subscribes to Supabase Realtime so the badge updates live.
 */
export function useUnreadConversations() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const lastVisitRef = useRef(getLastVisit());

  const fetchCount = useCallback(async () => {
    if (!user) return;

    // Count distinct leads with messages newer than last visit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('whatsapp_conversations')
      .select('lead_id')
      .eq('user_id', user.id)
      .gt('created_at', lastVisitRef.current);

    if (error) {
      console.error('[useUnreadConversations] fetch error:', error);
      return;
    }

    // Count distinct lead_ids client-side
    const uniqueLeads = new Set(
      (data as Array<{ lead_id: string }> || []).map((r) => r.lead_id)
    );
    setUnreadCount(uniqueLeads.size);
  }, [user]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Realtime: refetch when new messages arrive
  useEffect(() => {
    const channel = supabase
      .channel('inbox-unread-count')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_conversations',
        },
        () => fetchCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCount]);

  const markAsRead = useCallback(() => {
    const now = new Date().toISOString();
    lastVisitRef.current = now;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, now);
    }
    setUnreadCount(0);
  }, []);

  return { unreadCount, markAsRead };
}
