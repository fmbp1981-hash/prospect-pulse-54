# Consultant Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chatwoot-style consultant inbox at `/inbox` that lets admin/operador users view WhatsApp conversations, take over from the bot, send messages, and return conversations to the bot.

**Architecture:** New route `/inbox` with two-panel layout (conversation list left, chat thread right). Four new API routes handle server-side actions. Supabase Realtime subscriptions on `whatsapp_conversations` and `leads_prospeccao` push updates to the client without polling. No DB migrations needed — existing tables cover everything.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (`@supabase/ssr` server / `@supabase/supabase-js` client), Tailwind CSS, shadcn/ui, lucide-react, Evolution API (via `getWhatsAppProvider()`)

**Spec:** `docs/superpowers/specs/2026-03-19-consultant-inbox-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/api/inbox/conversations/route.ts` | Create | Returns list of leads+last-message for the inbox sidebar |
| `app/api/inbox/takeover/route.ts` | Create | Sets modo_atendimento=humano, sends WA tag, saves system message |
| `app/api/inbox/send-message/route.ts` | Create | Sends text via WA + saves to whatsapp_conversations |
| `app/api/inbox/return-to-bot/route.ts` | Create | Calls leadService.returnToBot() |
| `src/hooks/useTransferredCount.ts` | Create | Lightweight hook: count of humano leads + Realtime subscription |
| `src/components/AppSidebar.tsx` | Modify | Add "Inbox" item with live badge from useTransferredCount |
| `src/components/inbox/ConversationListItem.tsx` | Create | Single row in the conversation list |
| `src/components/inbox/ConversationList.tsx` | Create | Left panel: filters, search, list + Realtime on leads_prospeccao |
| `src/components/inbox/InboxHeader.tsx` | Create | Lead info + Assumir/Devolver buttons |
| `src/components/inbox/MessageInput.tsx` | Create | Textarea + send button, disabled until assumed |
| `src/components/inbox/ConversationThread.tsx` | Create | Right panel: message bubbles + Realtime on whatsapp_conversations |
| `app/(protected)/inbox/page.tsx` | Create | Page layout: ConversationList + ConversationThread side by side |

---

## Task 1: Create branch

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feature/consultant-inbox
```

Expected: `Switched to a new branch 'feature/consultant-inbox'`

---

## Task 2: API — GET /api/inbox/conversations

**Files:**
- Create: `app/api/inbox/conversations/route.ts`

This route returns leads that have conversations, with the last message preview. Uses `createServerClient` + `cookies()` pattern (same as `app/api/whatsapp/send/route.ts`).

- [ ] **Step 1: Create the route file**

```typescript
// app/api/inbox/conversations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/integrations/supabase/types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const filter = req.nextUrl.searchParams.get('filter') ?? 'transferred';

  // Build leads query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('leads_prospeccao')
    .select('id, lead, empresa, whatsapp, modo_atendimento, estagio_pipeline, data_ultima_interacao, data_transferencia')
    .eq('user_id', user.id)
    .order('data_ultima_interacao', { ascending: false })
    .limit(100);

  if (filter === 'transferred') {
    query = query.eq('modo_atendimento', 'humano');
  }

  const { data: leads, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!leads || leads.length === 0) {
    return NextResponse.json([]);
  }

  // For each lead, fetch the last conversation message
  const serviceSupabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [] } }
  );

  const results = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (leads as any[]).map(async (lead: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: convo } = await (serviceSupabase as any)
        .from('whatsapp_conversations')
        .select('message_lead, message_agent, timestamp, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const lastMessage = convo
        ? (convo.message_lead || convo.message_agent || '')
        : '';
      const lastMessageAt = convo
        ? (convo.timestamp || convo.created_at)
        : lead.data_ultima_interacao;

      return {
        leadId: lead.id,
        leadRef: lead.lead,
        name: lead.empresa,
        whatsapp: lead.whatsapp,
        modo_atendimento: lead.modo_atendimento,
        estagio_pipeline: lead.estagio_pipeline,
        dataTransferencia: lead.data_transferencia,
        lastMessage: (lastMessage as string).slice(0, 80),
        lastMessageAt,
      };
    })
  );

  // Filter out leads with no conversations at all (for 'all' filter)
  const filtered = filter === 'all'
    ? results.filter(r => r.lastMessageAt)
    : results;

  return NextResponse.json(filtered);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Projects/prospect-pulse-54 && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors for the new file (ignore pre-existing errors if any).

- [ ] **Step 3: Commit**

```bash
git add app/api/inbox/conversations/route.ts
git commit -m "feat(inbox): add GET /api/inbox/conversations route"
```

---

## Task 3: API — POST /api/inbox/takeover

**Files:**
- Create: `app/api/inbox/takeover/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// app/api/inbox/takeover/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getWhatsAppProvider } from '@/lib/integrations/whatsapp/whatsapp.factory';
import type { Database } from '@/integrations/supabase/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { leadId?: string };
  if (!body.leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const serviceSupabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Fetch lead
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (serviceSupabase as any)
    .from('leads_prospeccao')
    .select('id, whatsapp, modo_atendimento, data_ultima_acao_consultor')
    .eq('id', body.leadId)
    .eq('user_id', user.id)
    .single();

  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // 2. Idempotency: skip WA notification if already taken over in last 60s
  const lastAction = lead.data_ultima_acao_consultor as string | null;
  const recentlyTakenOver = lastAction
    && (Date.now() - new Date(lastAction).getTime()) < 60_000;

  // 3. Update lead: set humano + record consultant activity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceSupabase as any)
    .from('leads_prospeccao')
    .update({
      modo_atendimento: 'humano',
      data_ultima_acao_consultor: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.leadId);

  if (!recentlyTakenOver && lead.whatsapp) {
    // 4. Resolve consultant name from auth metadata
    const firstName =
      (user.user_metadata?.full_name as string | undefined)?.split(' ')[0]
      || user.email?.split('@')[0]
      || 'Consultor';

    const tagMessage = `[${firstName} entrou na conversa]`;

    // 5. Send WA notification + get user settings for instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: settings } = await (serviceSupabase as any)
      .from('user_settings')
      .select('evolution_instance_name')
      .eq('user_id', user.id)
      .single();

    const instanceName =
      settings?.evolution_instance_name || process.env.EVOLUTION_DEFAULT_INSTANCE!;

    const provider = getWhatsAppProvider();
    const sendResult = await provider.sendText(instanceName, lead.whatsapp, tagMessage);

    if (!sendResult.success) {
      console.warn('[Takeover] WA notification failed:', sendResult.error);
      // Non-fatal: continue even if notification fails
    }

    // 6. Save tag message to conversation history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (serviceSupabase as any)
      .from('whatsapp_conversations')
      .insert({
        lead_id: body.leadId,
        message_agent: tagMessage,
        from_lead: false,
        ai_generated: false,
        user_id: user.id,
        status: 'respondido',
        timestamp: new Date().toISOString(),
      });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Projects/prospect-pulse-54 && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add app/api/inbox/takeover/route.ts
git commit -m "feat(inbox): add POST /api/inbox/takeover route"
```

---

## Task 4: API — POST /api/inbox/send-message

**Files:**
- Create: `app/api/inbox/send-message/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// app/api/inbox/send-message/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getWhatsAppProvider } from '@/lib/integrations/whatsapp/whatsapp.factory';
import type { Database } from '@/integrations/supabase/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { leadId?: string; message?: string };
  if (!body.leadId || !body.message?.trim()) {
    return NextResponse.json({ error: 'leadId and message required' }, { status: 400 });
  }

  const serviceSupabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch lead
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (serviceSupabase as any)
    .from('leads_prospeccao')
    .select('id, whatsapp')
    .eq('id', body.leadId)
    .eq('user_id', user.id)
    .single();

  if (leadErr || !lead?.whatsapp) {
    return NextResponse.json({ error: 'Lead not found or no WhatsApp' }, { status: 404 });
  }

  // Fetch instance name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (serviceSupabase as any)
    .from('user_settings')
    .select('evolution_instance_name')
    .eq('user_id', user.id)
    .single();

  const instanceName =
    settings?.evolution_instance_name || process.env.EVOLUTION_DEFAULT_INSTANCE!;

  // Send via WhatsApp
  const provider = getWhatsAppProvider();
  const sendResult = await provider.sendText(instanceName, lead.whatsapp, body.message);

  if (!sendResult.success) {
    return NextResponse.json({ error: `WhatsApp send failed: ${sendResult.error}` }, { status: 500 });
  }

  const now = new Date().toISOString();

  // Save message to conversation history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceSupabase as any)
    .from('whatsapp_conversations')
    .insert({
      lead_id: body.leadId,
      message_agent: body.message,
      from_lead: false,
      ai_generated: false,
      user_id: user.id,
      status: 'respondido',
      timestamp: now,
    });

  // Update lead timestamps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceSupabase as any)
    .from('leads_prospeccao')
    .update({
      data_ultima_acao_consultor: now,
      data_ultima_interacao: now,
      updated_at: now,
    })
    .eq('id', body.leadId);

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Projects/prospect-pulse-54 && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add app/api/inbox/send-message/route.ts
git commit -m "feat(inbox): add POST /api/inbox/send-message route"
```

---

## Task 5: API — POST /api/inbox/return-to-bot

**Files:**
- Create: `app/api/inbox/return-to-bot/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// app/api/inbox/return-to-bot/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { leadService } from '@/lib/services/lead.service';
import type { Database } from '@/integrations/supabase/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { leadId?: string };
  if (!body.leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  // Verify lead belongs to the authenticated user before returning to bot
  const serviceSupabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (serviceSupabase as any)
    .from('leads_prospeccao')
    .select('id')
    .eq('id', body.leadId)
    .eq('user_id', user.id)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  await leadService.returnToBot(body.leadId);

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Projects/prospect-pulse-54 && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add app/api/inbox/return-to-bot/route.ts
git commit -m "feat(inbox): add POST /api/inbox/return-to-bot route"
```

---

## Task 6: Hook useTransferredCount + Sidebar badge

**Files:**
- Create: `src/hooks/useTransferredCount.ts`
- Modify: `src/components/AppSidebar.tsx`

This hook counts leads with `modo_atendimento = 'humano'` for the current user and subscribes to Realtime updates on `leads_prospeccao`.

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useTransferredCount.ts
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useTransferredCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;

    // Initial fetch
    const fetchCount = async () => {
      const { count: c } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('leads_prospeccao' as any)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('modo_atendimento', 'humano');
      setCount(c ?? 0);
    };

    fetchCount();

    // Realtime subscription
    const channel = supabase
      .channel('transferred-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads_prospeccao',
          filter: `user_id=eq.${user.id}`,
        },
        () => { fetchCount(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  return count;
}
```

- [ ] **Step 2: Add Inbox item to AppSidebar**

Open `src/components/AppSidebar.tsx`. Make these two changes:

**2a — Add import at top** (alongside existing lucide-react imports):
```tsx
import { LayoutDashboard, Table, Search, Settings, Link2, LogOut, User, FileText, LayoutGrid, Clock, BookOpen, MessageSquare } from "lucide-react";
import { useTransferredCount } from "@/hooks/useTransferredCount";
```

**2b — Add Inbox item to the `items` array** (after "Kanban Board", before "Templates"):
```tsx
{ title: "Inbox", url: "/inbox", icon: MessageSquare },
```

**2c — Add badge rendering** inside the `AppSidebar` function, after `const isCollapsed`:
```tsx
const transferredCount = useTransferredCount();
```

**2d — Update the NavLink rendering** to show badge on the Inbox item. Replace the existing `<NavLink ...>` block with:
```tsx
<NavLink
  href={item.url}
  className="group relative overflow-hidden rounded-lg transition-all duration-200 hover:scale-[1.02] hover:bg-primary hover:text-primary-foreground hover:shadow-lg my-1"
  activeClassName="bg-primary text-primary-foreground shadow-md before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-success before:rounded-l-lg"
>
  <div className="relative">
    <item.icon className="h-5 w-5 transition-transform group-hover:scale-110" />
    {item.title === "Inbox" && transferredCount > 0 && (
      <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
        {transferredCount > 9 ? '9+' : transferredCount}
      </span>
    )}
  </div>
  {!isCollapsed && (
    <span className="font-medium flex items-center gap-2">
      {item.title}
      {item.title === "Inbox" && transferredCount > 0 && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {transferredCount > 99 ? '99+' : transferredCount}
        </span>
      )}
    </span>
  )}
</NavLink>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd C:/Projects/prospect-pulse-54 && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTransferredCount.ts src/components/AppSidebar.tsx
git commit -m "feat(inbox): add sidebar Inbox item with transferred-count badge"
```

---

## Task 7: Component — ConversationListItem

**Files:**
- Create: `src/components/inbox/ConversationListItem.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/inbox/ConversationListItem.tsx
'use client';

import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export interface InboxLead {
  leadId: string;
  leadRef: string;
  name: string;
  whatsapp: string;
  modo_atendimento: string;
  estagio_pipeline: string;
  dataTransferencia: string | null;
  lastMessage: string;
  lastMessageAt: string | null;
}

interface ConversationListItemProps {
  lead: InboxLead;
  isSelected: boolean;
  onClick: () => void;
}

export function ConversationListItem({ lead, isSelected, onClick }: ConversationListItemProps) {
  const isTransferred = lead.modo_atendimento === 'humano';

  const timeAgo = lead.lastMessageAt
    ? formatDistanceToNow(new Date(lead.lastMessageAt), { addSuffix: true, locale: ptBR })
    : '';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 border-b border-border/40 transition-colors hover:bg-muted/50',
        isSelected && 'bg-primary/10 border-l-2 border-l-primary'
      )}
    >
      <div className="flex justify-between items-start gap-2">
        <span className="font-semibold text-sm text-foreground truncate">{lead.name}</span>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">{timeAgo}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 truncate">{lead.lastMessage || 'Sem mensagens'}</p>
      <div className="flex gap-2 mt-1.5 items-center">
        {isTransferred ? (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
            Transferido
          </span>
        ) : (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
            Bot ativo
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">{lead.leadRef}</span>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Projects/prospect-pulse-54 && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/ConversationListItem.tsx
git commit -m "feat(inbox): add ConversationListItem component"
```

---

## Task 8: Component — ConversationList

**Files:**
- Create: `src/components/inbox/ConversationList.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/inbox/ConversationList.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ConversationListItem, type InboxLead } from './ConversationListItem';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type Filter = 'transferred' | 'all';

interface ConversationListProps {
  selectedLeadId: string | null;
  onSelect: (leadId: string, lead: InboxLead) => void;
}

export function ConversationList({ selectedLeadId, onSelect }: ConversationListProps) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('transferred');
  const [search, setSearch] = useState('');
  const [leads, setLeads] = useState<InboxLead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = useCallback(async () => {
    const res = await fetch(`/api/inbox/conversations?filter=${filter}`);
    if (res.ok) {
      const data = await res.json() as InboxLead[];
      setLeads(data);
    }
    setLoading(false);
  }, [filter]);

  // Fetch on mount and filter change
  useEffect(() => {
    setLoading(true);
    fetchLeads();
  }, [fetchLeads]);

  // Realtime: re-fetch when leads_prospeccao changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('inbox-leads-list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads_prospeccao',
          filter: `user_id=eq.${user.id}`,
        },
        () => { fetchLeads(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchLeads]);

  const filtered = leads.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.leadRef.toLowerCase().includes(search.toLowerCase()) ||
    l.whatsapp.includes(search)
  );

  return (
    <div className="flex flex-col h-full border-r border-border">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <h2 className="font-semibold text-sm mb-2">Atendimento</h2>
        <div className="flex gap-1">
          {(['transferred', 'all'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full transition-colors',
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {f === 'transferred' ? 'Transferidos' : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar lead..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="text-xs text-muted-foreground text-center py-8">Carregando...</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            {filter === 'transferred' ? 'Nenhuma conversa transferida.' : 'Nenhuma conversa encontrada.'}
          </p>
        )}
        {filtered.map(lead => (
          <ConversationListItem
            key={lead.leadId}
            lead={lead}
            isSelected={lead.leadId === selectedLeadId}
            onClick={() => onSelect(lead.leadId, lead)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Projects/prospect-pulse-54 && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/ConversationList.tsx
git commit -m "feat(inbox): add ConversationList component with filter and realtime"
```

---

## Task 9: Component — InboxHeader

**Files:**
- Create: `src/components/inbox/InboxHeader.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/inbox/InboxHeader.tsx
'use client';

import { Button } from '@/components/ui/button';
import { UserCheck, BotIcon } from 'lucide-react';
import type { InboxLead } from './ConversationListItem';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface InboxHeaderProps {
  lead: InboxLead;
  isAssumed: boolean;
  onTakeover: () => void;
  onReturnToBot: () => void;
  loading?: boolean;
}

export function InboxHeader({ lead, isAssumed, onTakeover, onReturnToBot, loading }: InboxHeaderProps) {
  const transferredAgo = lead.dataTransferencia
    ? formatDistanceToNow(new Date(lead.dataTransferencia), { addSuffix: true, locale: ptBR })
    : null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
      <div>
        <p className="font-semibold text-sm">{lead.name}</p>
        <p className="text-xs text-muted-foreground">
          {lead.whatsapp} · {lead.leadRef}
          {transferredAgo && ` · Transferido ${transferredAgo}`}
        </p>
      </div>
      <div className="flex gap-2">
        {!isAssumed ? (
          <Button
            size="sm"
            variant="default"
            onClick={onTakeover}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <UserCheck className="h-3.5 w-3.5" />
            Assumir conversa
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={onReturnToBot}
            disabled={loading}
            className="gap-1.5 text-xs text-green-600 border-green-600/40 hover:bg-green-600/10"
          >
            <BotIcon className="h-3.5 w-3.5" />
            Devolver ao bot
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Projects/prospect-pulse-54 && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/InboxHeader.tsx
git commit -m "feat(inbox): add InboxHeader component"
```

---

## Task 10: Component — MessageInput

**Files:**
- Create: `src/components/inbox/MessageInput.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/inbox/MessageInput.tsx
'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';

interface MessageInputProps {
  disabled: boolean;
  onSend: (message: string) => Promise<void>;
}

export function MessageInput({ disabled, onSend }: MessageInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    await onSend(trimmed);
    setSending(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2 items-end p-3 border-t border-border">
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || sending}
        placeholder={
          disabled
            ? 'Clique em "Assumir conversa" para começar a responder...'
            : 'Digite uma mensagem... (Ctrl+Enter para enviar)'
        }
        rows={2}
        className="flex-1 resize-none text-sm min-h-[60px] max-h-[120px]"
      />
      <Button
        onClick={handleSend}
        disabled={disabled || sending || !text.trim()}
        size="sm"
        className="h-[60px] px-3"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Projects/prospect-pulse-54 && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/MessageInput.tsx
git commit -m "feat(inbox): add MessageInput component"
```

---

## Task 11: Component — ConversationThread

**Files:**
- Create: `src/components/inbox/ConversationThread.tsx`

This is the most complex component. It fetches history, subscribes to Realtime, and owns `isAssumed` state.

- [ ] **Step 1: Create the component**

```tsx
// src/components/inbox/ConversationThread.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { conversationRepository, type ConversationEntry } from '@/lib/repositories/conversation.repository';
import { InboxHeader } from './InboxHeader';
import { MessageInput } from './MessageInput';
import type { InboxLead } from './ConversationListItem';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ConversationThreadProps {
  lead: InboxLead | null;
}

export function ConversationThread({ lead }: ConversationThreadProps) {
  const [messages, setMessages] = useState<ConversationEntry[]>([]);
  const [isAssumed, setIsAssumed] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Reset state when lead changes
  useEffect(() => {
    setIsAssumed(false);
    setMessages([]);
  }, [lead?.leadId]);

  const fetchHistory = useCallback(async () => {
    if (!lead?.leadId) return;
    try {
      const history = await conversationRepository.getHistory(lead.leadId, 50);
      setMessages(history);
    } catch (err) {
      console.error('[ConversationThread] fetchHistory error:', err);
    }
  }, [lead?.leadId]);

  // Fetch on lead change
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime subscription on whatsapp_conversations for selected lead
  useEffect(() => {
    if (!lead?.leadId) return;

    const channel = supabase
      .channel(`thread-${lead.leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_conversations',
          filter: `lead_id=eq.${lead.leadId}`,
        },
        () => { fetchHistory(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [lead?.leadId, fetchHistory]);

  const handleTakeover = async () => {
    if (!lead?.leadId) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/inbox/takeover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.leadId }),
      });
      if (res.ok) {
        setIsAssumed(true);
      } else {
        const err = await res.json();
        console.error('[Takeover] failed:', err);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturnToBot = async () => {
    if (!lead?.leadId) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/inbox/return-to-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.leadId }),
      });
      if (res.ok) {
        setIsAssumed(false);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleSend = async (message: string) => {
    if (!lead?.leadId) return;
    await fetch('/api/inbox/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.leadId, message }),
    });
    // Realtime will trigger fetchHistory — no need to manually update
  };

  if (!lead) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Selecione uma conversa para começar
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <InboxHeader
        lead={lead}
        isAssumed={isAssumed}
        onTakeover={handleTakeover}
        onReturnToBot={handleReturnToBot}
        loading={actionLoading}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-8">Sem mensagens ainda.</p>
        )}
        {messages.map((msg, i) => {
          const isSystem = !msg.from_lead && msg.message.startsWith('[') && msg.message.endsWith(']');
          const isLead = msg.from_lead;
          // Consultant: from_lead=false AND not a system tag (identified by absence of brackets)
          const isConsultant = !msg.from_lead && !isSystem;

          if (isSystem) {
            return (
              <div key={i} className="flex justify-center">
                <span className="text-[10px] bg-muted text-muted-foreground px-3 py-1 rounded-full">
                  {msg.message}
                </span>
              </div>
            );
          }

          return (
            <div key={i} className={cn('flex gap-2 items-end', !isLead && 'flex-row-reverse')}>
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0',
                isLead ? 'bg-amber-500/20' : isConsultant ? 'bg-green-500/20' : 'bg-primary/20'
              )}>
                {isLead ? '👤' : isConsultant ? '👤' : '🤖'}
              </div>
              <div className={cn('max-w-[65%]', !isLead && 'items-end')}>
                <div className="text-[10px] text-muted-foreground mb-1 px-1">
                  {format(new Date(msg.timestamp), 'HH:mm', { locale: ptBR })}
                  {isConsultant && <span className="ml-1 text-green-600 dark:text-green-400">· Consultor</span>}
                </div>
                <div className={cn(
                  'px-3 py-2 rounded-xl text-sm leading-relaxed',
                  isLead
                    ? 'bg-amber-500/10 rounded-bl-sm'
                    : isConsultant
                      ? 'bg-green-500/10 rounded-br-sm'
                      : 'bg-primary/10 rounded-br-sm'
                )}>
                  {msg.message}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <MessageInput disabled={!isAssumed} onSend={handleSend} />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Projects/prospect-pulse-54 && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/ConversationThread.tsx
git commit -m "feat(inbox): add ConversationThread with realtime and takeover state"
```

---

## Task 12: Page — /inbox

**Files:**
- Create: `app/(protected)/inbox/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// app/(protected)/inbox/page.tsx
'use client';

import { useState } from 'react';
import { ConversationList } from '@/components/inbox/ConversationList';
import { ConversationThread } from '@/components/inbox/ConversationThread';
import { RoleGuard } from '@/components/RoleGuard';
import type { InboxLead } from '@/components/inbox/ConversationListItem';

export default function InboxPage() {
  const [selectedLead, setSelectedLead] = useState<InboxLead | null>(null);

  return (
    <RoleGuard
      allowedRoles={['admin', 'operador']}
      fallback={
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Você não tem permissão para acessar o Inbox.
        </div>
      }
    >
      <div className="flex h-[calc(100vh-56px)] overflow-hidden">
        {/* Left: conversation list (fixed 280px) */}
        <div className="w-[280px] flex-shrink-0 overflow-hidden">
          <ConversationList
            selectedLeadId={selectedLead?.leadId ?? null}
            onSelect={(_leadId, lead) => setSelectedLead(lead)}
          />
        </div>

        {/* Right: chat thread (fills remaining space) */}
        <div className="flex-1 overflow-hidden">
          <ConversationThread lead={selectedLead} />
        </div>
      </div>
    </RoleGuard>
  );
}
```

> **Important:** `ConversationList.onSelect` must pass the full `InboxLead` object (not just `leadId`). The `ConversationList` prop signature must be `onSelect: (leadId: string, lead: InboxLead) => void` and the item click handler `onClick={() => onSelect(lead.leadId, lead)}` — this is already correct in Task 8's code above.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd C:/Projects/prospect-pulse-54 && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 4: Check it builds**

```bash
cd C:/Projects/prospect-pulse-54 && npm run build 2>&1 | tail -20
```

Expected: Build succeeds (no fatal errors).

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/inbox/page.tsx" src/components/inbox/ConversationList.tsx
git commit -m "feat(inbox): add /inbox page — Chatwoot-style consultant inbox"
```

---

## Task 13: Enable Supabase Realtime (manual step)

Realtime must be enabled on both tables in the Supabase Dashboard. This is a one-time manual configuration.

- [ ] **Step 1: Enable Realtime on `leads_prospeccao`**

1. Go to Supabase Dashboard → project `kzvnwqlcrtxwagxkghxq`
2. Navigate to **Database → Replication** (or **Database → Tables**)
3. Find `leads_prospeccao` → toggle **Realtime** to ON

- [ ] **Step 2: Enable Realtime on `whatsapp_conversations`**

Same steps for `whatsapp_conversations`.

- [ ] **Step 3: Verify in browser**

1. Run `npm run dev`
2. Open `http://localhost:3000/inbox`
3. Open a second browser tab with WhatsApp simulator or send a real message
4. Confirm the conversation list updates without page refresh

---

## Task 14: End-to-end manual test

- [ ] **Step 1: Start dev server**

```bash
cd C:/Projects/prospect-pulse-54 && npm run dev
```

- [ ] **Step 2: Navigate to /inbox and confirm:**
  - [ ] Sidebar shows "Inbox" item with badge if any transferred leads exist
  - [ ] Conversation list shows transferred leads with amber "Transferido" badge
  - [ ] Clicking a lead shows the conversation thread on the right
  - [ ] Bot and lead messages render with correct styling
  - [ ] System events (transfer tags) render as centered pills
  - [ ] "Assumir conversa" button is visible; message input is disabled

- [ ] **Step 3: Click "Assumir conversa" and confirm:**
  - [ ] Button changes to "Devolver ao bot"
  - [ ] Message input becomes enabled
  - [ ] Lead receives `[Consultor X entrou na conversa]` on WhatsApp

- [ ] **Step 4: Send a message and confirm:**
  - [ ] Message appears in the thread (via Realtime)
  - [ ] Lead receives it on WhatsApp

- [ ] **Step 5: Click "Devolver ao bot" and confirm:**
  - [ ] Button reverts to "Assumir conversa"
  - [ ] Message input becomes disabled
  - [ ] Lead moves to "Bot ativo" status in the list

- [ ] **Step 6: Commit final state**

```bash
cd C:/Projects/prospect-pulse-54 && git add -A && git commit -m "feat(inbox): complete consultant inbox implementation"
```
