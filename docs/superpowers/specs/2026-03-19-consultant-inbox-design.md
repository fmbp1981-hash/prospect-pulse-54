# Consultant Inbox — Design Spec
**Date:** 2026-03-19
**Branch:** `feature/consultant-inbox`
**Status:** Approved by user

---

## Overview

Add a Chatwoot-style consultant inbox to LeadFinder Pro that allows admin/operador users to:
- View all WhatsApp conversations with leads in real-time
- Take over conversations transferred from the bot
- Send messages directly to leads via the panel
- Return conversations to the bot when done
- Automatically notify the lead in WhatsApp when the consultant joins

---

## 1. User Stories

| As a... | I want to... | So that... |
|---|---|---|
| Consultant (admin/operador) | See all leads with active conversations | I know who needs attention |
| Consultant | See conversations transferred from the bot highlighted | I can prioritize pending handoffs |
| Consultant | Click a lead and read the full conversation history | I have full context before responding |
| Consultant | Click "Assumir conversa" to take over | The bot stops responding and I can talk to the lead |
| Consultant | See a notification sent to the lead when I take over | The lead knows a human joined |
| Consultant | Type and send messages from the panel | The lead receives them on WhatsApp |
| Consultant | Click "Devolver ao bot" when done | The AI resumes handling the lead |

---

## 2. Layout & UX

**Route:** `/inbox` (new item in the protected sidebar)

**Layout:** Chatwoot-style two-panel:
- **Left panel (280px):** Conversation list with filters + search
- **Right panel (flex):** Chat thread + message input

**Sidebar badge:** Count of leads with `modo_atendimento = 'humano'` (transferred, awaiting consultant).

**Conversation list filters:**
- **Transferidos** (default) — leads with `modo_atendimento = 'humano'`
- **Todos** — all leads with any `whatsapp_conversations` row
- ~~**Meus**~~ — out of scope for this iteration

**Conversation list item shows:**
- Lead name, lead ref (e.g. Lead-042), last message preview, timestamp
- Status badge: `Transferido` (amber) or `Bot ativo` (indigo)

**Chat thread:**
- Full history from `whatsapp_conversations`, rendered as individual messages
- Bot messages: indigo avatar 🤖
- Lead messages: amber avatar 👤
- Consultant messages: green avatar 👤 (identified by `ai_generated = false` + `from_lead = false`)
- System events (transfer): centered pill label

**Chat header (when lead selected):**
- Lead name, phone number, lead ref, transfer timestamp
- Button: **"Assumir conversa"** (blue) — visible when `isAssumed = false` (local React state, defaults to `false` on load)
- Button: **"Devolver ao bot"** (green) — visible when `isAssumed = true`
- `isAssumed` is local component state. Initialized to `false` when a lead is selected (conservative: always requires the consultant to click "Assumir" per session, even if `modo_atendimento` is already `humano`). Flips to `true` on successful `/api/inbox/takeover` response.
- After "Assumir": buttons swap, message input becomes active, `data_ultima_acao_consultor` updated in DB

**Message input:**
- Disabled (greyed out, placeholder: "Clique em Assumir conversa para começar a responder...") until consultant takes over
- After takeover: enabled textarea + "Enviar" button
- Send on click or Ctrl+Enter

**Access control:** Roles `admin` and `operador` only (RoleGuard).

---

## 3. Real-Time Updates

**Technology:** Supabase Realtime

**Subscriptions:**
1. `whatsapp_conversations` — INSERT/UPDATE filtered by `lead_id` of the selected conversation → updates the chat thread
2. `leads_prospeccao` — UPDATE filtered by `user_id` of the tenant → updates the conversation list (new transfers, status changes)

**Configuration required:** Enable Realtime on both tables in Supabase Dashboard (no code change, 1-click toggle per table).

**Client-side:** `useEffect` hook subscribes on mount and cleans up on unmount. Re-subscribes when selected lead changes.

---

## 4. API Routes

### `GET /api/inbox/conversations`
Returns list of leads with conversation data for the current user's tenant.

**Query params:**
- `filter`: `transferred` | `all` (default: `transferred`)
- Note: `mine` filter is out of scope for this iteration — not implemented

**Response:**
```json
[
  {
    "leadId": "ORG-...",
    "leadRef": "Lead-042",
    "name": "João Silva",
    "whatsapp": "+558199999001",
    "modo_atendimento": "humano",
    "estagio_pipeline": "Transferido para Consultor",
    "lastMessage": "Alguém vai me atender?",
    "lastMessageAt": "2026-03-19T14:32:00Z",
    "unread": true
  }
]
```

### `POST /api/inbox/takeover`
Consultant assumes a conversation.

**Body:** `{ "leadId": string }`

**Actions:**
1. Set `modo_atendimento = 'humano'` on the lead (already may be set — idempotent)
2. Set `data_ultima_acao_consultor = now()`
3. Send WhatsApp message: `[Consultor {firstName} entrou na conversa]` via `getWhatsAppProvider().sendText()`
4. Save the tag message to `whatsapp_conversations` as a system entry (`ai_generated: false`, `from_lead: false`)

**Consultant name:** Resolved from Supabase auth user metadata (`user.user_metadata.full_name` or `user.email` as fallback).

### `POST /api/inbox/send-message`
Consultant sends a message from the panel.

**Body:** `{ "leadId": string, "message": string }`

**Actions:**
1. Send message via `getWhatsAppProvider().sendText(instanceName, lead.whatsapp, message)`
2. Save to `whatsapp_conversations`: `{ message_agent: message, from_lead: false, ai_generated: false }`
3. Update `leads_prospeccao.data_ultima_acao_consultor = now()`
4. Update `leads_prospeccao.data_ultima_interacao = now()`

### `POST /api/inbox/return-to-bot`
Return conversation to bot.

**Body:** `{ "leadId": string }`

**Actions:**
1. Call `leadService.returnToBot(leadId)` (sets `modo_atendimento = 'bot'`)

---

## 5. Components

### `app/(protected)/inbox/page.tsx`
- Layout: `flex h-full` with `ConversationList` + `ConversationThread` side by side
- State: `selectedLeadId: string | null`
- Fetches conversation list on mount; passes `onSelect` to `ConversationList`

### `src/components/inbox/ConversationList.tsx`
Props: `selectedLeadId`, `onSelect(leadId)`
- Fetches `/api/inbox/conversations?filter=...`
- Subscribes to `leads_prospeccao` Realtime for live badge updates
- Renders filter tabs + search input + list of `ConversationListItem`

### `src/components/inbox/ConversationListItem.tsx`
Props: `lead`, `isSelected`, `onClick`
- Renders name, last message preview (truncated), timestamp, status badge
- Highlights selected with left border + background

### `src/components/inbox/ConversationThread.tsx`
Props: `leadId: string | null`
- Fetches conversation history from existing `conversationRepository.getHistory(leadId)`
- Subscribes to `whatsapp_conversations` Realtime for live message updates
- Renders message bubbles + system event pills
- Renders `InboxHeader` at top + `MessageInput` at bottom

### `src/components/inbox/InboxHeader.tsx`
Props: `lead`, `onTakeover`, `onReturnToBot`, `isAssumed: boolean`
- Shows lead info + conditional action buttons
- "Assumir conversa": visible when `isAssumed = false`
- "Devolver ao bot": visible when `isAssumed = true`
- `isAssumed` is owned by `ConversationThread`, passed down as prop

### `src/components/inbox/MessageInput.tsx`
Props: `disabled`, `onSend(message: string)`
- Textarea + send button
- Disabled state with placeholder hint
- Sends on button click or Ctrl+Enter

---

## 6. Navigation Change

File: `app/(protected)/layout.tsx` (or wherever the sidebar is defined)

Add sidebar item:
```tsx
<SidebarItem href="/inbox" icon={<MessageSquare />} label="Inbox">
  {transferredCount > 0 && <Badge>{transferredCount}</Badge>}
</SidebarItem>
```

Badge count fetched from `/api/inbox/conversations?filter=transferred` count, refreshed via Realtime.
The sidebar lives in the protected layout, outside the inbox page. To avoid a separate fetch in the layout, the badge count is implemented as a lightweight standalone hook `useTransferredCount()` that the layout imports — it does a single `SELECT count(*)` from `leads_prospeccao WHERE modo_atendimento = 'humano'` and subscribes to Realtime updates. This keeps the layout decoupled from the inbox page state.

---

## 7. Data Flow — Consultant Message

```
Consultant types → clicks Enviar
  → POST /api/inbox/send-message
    → sendText() via Evolution API  [fire to WhatsApp]
    → INSERT whatsapp_conversations  [save to DB]
    → UPDATE leads_prospeccao        [update timestamps]
  → Supabase Realtime fires
    → ConversationThread re-renders with new message
```

---

## 8. Error Handling

- API routes return `{ error: string }` with appropriate HTTP status
- Failed `sendText()`: return `500`, do not save to DB (avoid ghost messages)
- Realtime disconnect: auto-reconnect handled by Supabase client
- Takeover on already-taken-over lead: idempotent (no double WA notification — check `data_ultima_acao_consultor` within last 60s)

---

## 9. Out of Scope (this iteration)

- Read receipts / message status in the panel
- File/image/audio sending from the panel (text only)
- Multiple consultants — no conflict resolution for simultaneous takeover
- Push notifications / sound alerts
- "Meus" filter (can be added later)
