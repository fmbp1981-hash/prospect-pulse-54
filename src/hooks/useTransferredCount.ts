'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns the count of leads currently in human-mode (transferred to consultant).
 * Subscribes to Supabase Realtime so the badge updates live.
 */
export function useTransferredCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: c, error } = await (supabase as any)
      .from('leads_prospeccao')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('modo_atendimento', 'humano');

    if (!error && typeof c === 'number') {
      setCount(c);
    }
  }, [user]);

  useEffect(() => {
    fetchCount();

    // Subscribe to changes on leads_prospeccao for this user
    const channel = supabase
      .channel('inbox-transferred-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads_prospeccao',
        },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCount]);

  return count;
}
