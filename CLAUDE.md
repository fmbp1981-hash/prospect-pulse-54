# CLAUDE.md - LeadFinder Pro CRM

**AI Assistant Guide for LeadFinder Pro Development**

Last updated: 2025-11-16
Version: 1.0

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture](#architecture)
4. [Directory Structure](#directory-structure)
5. [Development Workflows](#development-workflows)
6. [Key Conventions](#key-conventions)
7. [Database Schema](#database-schema)
8. [Authentication & Security](#authentication--security)
9. [Common Tasks](#common-tasks)
10. [Troubleshooting](#troubleshooting)
11. [External Integrations](#external-integrations)

---

## Project Overview

**LeadFinder Pro** is a modern CRM platform designed for lead prospecting, management, and WhatsApp outreach. Built on Lovable.dev platform.

### Core Features

- **Lead Prospecting**: Google Places API integration for finding business leads
- **Multi-tenant Architecture**: User isolation with Row Level Security (RLS)
- **WhatsApp Integration**: Automated message generation using AI
- **Analytics Dashboard**: Comprehensive metrics and charts
- **Lead Management**: Full CRUD operations with status tracking
- **Data Enrichment**: Firecrawl API for website analysis
- **Bulk Operations**: Mass actions on leads (export, dispatch, delete)

### Project URL
- Lovable Project: https://lovable.dev/projects/fad09e3c-a647-4d0f-a32a-39e775324c83

---

## Technology Stack

### Frontend
- **Framework**: React 18.3.1 with TypeScript
- **Build Tool**: Vite 5.4.19
- **Routing**: React Router DOM 6.30.1
- **State Management**: TanStack Query 5.83.0
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS 3.4.17 with custom theme
- **Charts**: Recharts 2.15.4
- **Animations**: Framer Motion 12.23.24
- **Form Handling**: React Hook Form 7.61.1 + Zod 3.25.76
- **Icons**: Lucide React 0.462.0

### Backend
- **Database**: Supabase (PostgreSQL)
- **Edge Functions**: Deno (hosted on Supabase)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage

### External APIs
- **Google Places API**: Lead prospecting
- **Firecrawl API**: Website content enrichment
- **Lovable AI Gateway**: WhatsApp message generation
- **Evolution API**: WhatsApp dispatch (optional)

### Development Tools
- **Linter**: ESLint 9.32.0 with TypeScript
- **Package Manager**: npm (package-lock.json present)
- **Version Control**: Git
- **Type Checking**: TypeScript 5.8.3

---

## Architecture

### Application Flow

```
User Authentication (Supabase Auth)
    ↓
Protected Routes (React Router + ProtectedRoute)
    ↓
Main Layout (AppSidebar + Content Area)
    ↓
Pages (Index, Dashboard, LeadsTable)
    ↓
Components (ProspectionForm, Charts, Tables)
    ↓
TanStack Query (Data Fetching & Caching)
    ↓
Supabase Client (API Calls)
    ↓
Backend (Supabase PostgreSQL + Edge Functions)
```

### Multi-Tenant Architecture

**CRITICAL**: The application implements **multi-tenancy** at the database level using:

1. **RLS (Row Level Security)**: Enabled on `leads_prospeccao` table
2. **Database Trigger**: Automatically sets `user_id` on insert
3. **Policies**: 4 policies (SELECT, INSERT, UPDATE, DELETE) ensure data isolation
4. **Edge Function Authentication**: Uses user's auth token (NOT service role key)

**Authentication Flow**:
```typescript
// Edge Function authenticates user via Authorization header
const authHeader = req.headers.get('Authorization');
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: authHeader } }
});
```

---

## Directory Structure

```
prospect-pulse-54/
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # shadcn/ui components (40+ components)
│   │   ├── leads/          # Lead-specific components
│   │   └── dashboard/      # Dashboard components (charts, metrics)
│   ├── contexts/           # React contexts (AuthContext)
│   ├── data/               # Static data (prospectionQuickSelects)
│   ├── hooks/              # Custom React hooks (use-toast, use-mobile)
│   ├── integrations/       # External integrations
│   │   └── supabase/       # Supabase client & types
│   ├── lib/                # Utility functions
│   ├── pages/              # Page components (7 pages)
│   ├── types/              # TypeScript type definitions
│   ├── App.tsx             # Main app component
│   └── main.tsx            # Application entry point
├── supabase/
│   ├── functions/          # Edge Functions (Deno)
│   │   └── prospection/    # Main prospection function
│   └── migrations/         # SQL migrations (4 files)
├── public/                 # Static assets
├── .env.example            # Environment variables template
├── package.json            # Dependencies & scripts
├── tailwind.config.ts      # Tailwind configuration
├── tsconfig.json           # TypeScript configuration
├── vite.config.ts          # Vite configuration
└── README.md               # Project documentation
```

### Key Directories

- **src/components/ui/**: DO NOT modify directly (generated by shadcn/ui)
- **src/integrations/supabase/types.ts**: Auto-generated from Supabase schema
- **supabase/migrations/**: Database schema evolution (never modify manually)

---

## Development Workflows

### Local Development Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd prospect-pulse-54

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env with Supabase credentials

# 4. Start development server
npm run dev
# Runs on http://localhost:8080

# 5. Build for production
npm run build

# 6. Preview production build
npm run preview
```

### Git Branch Workflow

**IMPORTANT**: Always work on feature branches starting with `claude/`:

```bash
# Current branch naming pattern
claude/claude-md-{sessionId}-{uniqueId}

# Example
claude/claude-md-mi1ztnc7n0hypjyg-01Ap5ofT6zvCtL6PBzqS7b5w
```

### Commit Message Conventions

Based on repository history:

```
Feature: [Brief description]
Fix: [Brief description]
Docs: [Brief description]
Refactor: [Brief description]
Test: [Brief description]
```

**Examples from repo**:
- `Feature: Implementar Dashboard Analítico completo`
- `Fix: Corrigir warnings e melhorar código`
- `Docs: Resumo completo do trabalho noturno`

### Supabase Edge Functions Development

```bash
# Deploy Edge Function
supabase functions deploy prospection

# Test locally
supabase functions serve prospection

# View logs
supabase functions logs prospection
```

---

## Key Conventions

### File Naming

- **Components**: PascalCase (e.g., `ProspectionForm.tsx`, `LeadDetailDrawer.tsx`)
- **Utilities**: camelCase (e.g., `use-toast.ts`, `use-mobile.tsx`)
- **Types**: PascalCase (e.g., `Database`, `Tables`)
- **Constants**: UPPER_SNAKE_CASE (in code)

### Component Structure

```typescript
// 1. Imports (grouped: React, external libs, internal, types)
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

// 2. Types/Interfaces
interface MyComponentProps {
  title: string;
  onAction: () => void;
}

// 3. Component definition
export function MyComponent({ title, onAction }: MyComponentProps) {
  // 4. State & hooks
  const [data, setData] = useState(null);

  // 5. Effects
  useEffect(() => {
    // ...
  }, []);

  // 6. Handlers
  const handleClick = () => {
    // ...
  };

  // 7. Render
  return (
    <div className="p-4">
      {/* ... */}
    </div>
  );
}
```

### Styling Conventions

- **Use Tailwind classes** (no inline styles)
- **Responsive design**: Mobile-first (`className="text-sm md:text-base lg:text-lg"`)
- **Spacing**: Consistent spacing scale (p-4, gap-4, space-y-4)
- **Colors**: Use CSS variables (hsl(var(--primary)))
- **Dark mode**: Automatically supported via `darkMode: ["class"]`

### State Management

- **Server State**: TanStack Query (React Query)
- **Local State**: useState, useReducer
- **Global State**: React Context (AuthContext)
- **Form State**: React Hook Form

### Error Handling

```typescript
try {
  const { data, error } = await supabase
    .from('leads_prospeccao')
    .select('*');

  if (error) {
    console.error('Database error:', error);
    toast.error('Failed to load leads');
    return;
  }

  // Process data
} catch (error) {
  console.error('Unexpected error:', error);
  toast.error('An unexpected error occurred');
}
```

### Toast Notifications

Three toast systems are available (unified in App.tsx):

```typescript
// 1. shadcn/ui toast
import { useToast } from "@/hooks/use-toast";
const { toast } = useToast();
toast({ title: "Success", description: "Lead created" });

// 2. Sonner
import { toast } from "sonner";
toast.success("Lead created successfully");

// 3. React Hot Toast (preferred for real-time feedback)
import toast from "react-hot-toast";
toast.success("Lead created!");
toast.error("Failed to create lead");
toast.loading("Creating lead...");
```

---

## Database Schema

### Main Table: `leads_prospeccao`

```sql
CREATE TABLE public.leads_prospeccao (
  id TEXT PRIMARY KEY,              -- Google Place ID or generated UUID
  lead TEXT NOT NULL,               -- Format: "Lead-001", "Lead-002"
  empresa TEXT NOT NULL,            -- Company name
  categoria TEXT,                   -- Business category/niche
  telefone_whatsapp TEXT,          -- Phone number (international format)
  endereco TEXT,                    -- Full address
  cidade TEXT,                      -- City
  bairro_regiao TEXT,              -- Neighborhood
  website TEXT,                     -- Website URL
  instagram TEXT,                   -- Instagram handle
  link_gmn TEXT,                    -- Google Maps link
  aceita_cartao TEXT,              -- Accepts card payments
  mensagem_whatsapp TEXT,          -- Generated WhatsApp message
  status_msg_wa TEXT,              -- WhatsApp status: not_sent, sent, failed
  data_envio_wa TIMESTAMP,         -- WhatsApp sent timestamp
  resumo_analitico TEXT,           -- Firecrawl enrichment summary
  cnpj TEXT,                        -- Brazilian company ID
  status TEXT DEFAULT 'Novo',      -- Lead status: Novo, Recorrente
  data TEXT,                        -- Formatted date string
  email TEXT,                       -- Email address
  contato TEXT,                     -- Contact person
  user_id UUID REFERENCES auth.users(id), -- Multi-tenant user ID
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### RLS Policies

```sql
-- Users can only view their own leads
CREATE POLICY "Users can view own leads"
  ON public.leads_prospeccao FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own leads
CREATE POLICY "Users can insert own leads"
  ON public.leads_prospeccao FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can only update their own leads
CREATE POLICY "Users can update own leads"
  ON public.leads_prospeccao FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own leads
CREATE POLICY "Users can delete own leads"
  ON public.leads_prospeccao FOR DELETE
  USING (auth.uid() = user_id);
```

### Database Trigger

```sql
CREATE OR REPLACE FUNCTION public.set_user_id_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  IF NEW.user_id = auth.uid() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Você não pode criar leads para outro usuário';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_set_user_id
  BEFORE INSERT ON public.leads_prospeccao
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id_on_insert();
```

---

## Authentication & Security

### Authentication Flow

1. **Sign Up**: Email + Password (no email confirmation by default)
   - Route: `/auth/signup`
   - Redirects to login after successful signup
   - NO email verification screen shown

2. **Login**: Email + Password
   - Route: `/auth/login`
   - Sets session in localStorage
   - Redirects to home page

3. **Protected Routes**: All routes except auth pages require authentication
   - Wrapped in `<ProtectedRoute>` component
   - Redirects to `/auth/login` if not authenticated

### Environment Variables

```bash
# Required in .env
VITE_SUPABASE_PROJECT_ID=your-project-id
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-public-key
VITE_SUPABASE_URL=https://your-project-id.supabase.co

# Required in Supabase Edge Function Secrets
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key (NOT service role!)
GOOGLE_PLACES_API_KEY=your-google-api-key
FIRECRAWL_API_KEY=your-firecrawl-key (optional)
LOVABLE_API_KEY=your-lovable-key (optional)
```

### Security Best Practices

1. **NEVER use Service Role Key in Edge Functions** (breaks auth.uid())
2. **Always pass Authorization header** to Edge Functions
3. **Enable RLS** on all tables
4. **Validate user input** before database operations
5. **Use parameterized queries** (Supabase client handles this)
6. **Never commit .env** file (use .env.example)

---

## Common Tasks

### Adding a New Page

```typescript
// 1. Create page component in src/pages/
// src/pages/MyNewPage.tsx
export default function MyNewPage() {
  return <div>My New Page</div>;
}

// 2. Add route in App.tsx
import MyNewPage from "./pages/MyNewPage";

<Route
  path="/my-new-page"
  element={
    <ProtectedRoute>
      <Layout>
        <MyNewPage />
      </Layout>
    </ProtectedRoute>
  }
/>

// 3. Add navigation link in AppSidebar.tsx
{
  title: "My New Page",
  url: "/my-new-page",
  icon: Icon,
}
```

### Adding a UI Component

```bash
# Use shadcn/ui CLI (if available)
npx shadcn@latest add [component-name]

# Or manually create in src/components/
```

### Fetching Data with TanStack Query

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function MyComponent() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads_prospeccao')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{/* Render data */}</div>;
}
```

### Creating a Database Migration

```bash
# Never create migrations manually
# Use Supabase Dashboard SQL Editor instead
# Migrations are auto-generated when deploying
```

### Modifying Quick Select Data

Edit `src/data/prospectionQuickSelects.ts`:

```typescript
export const quickSelectNiches = [
  { value: "Pizzarias", label: "🍕 Pizzarias" },
  { value: "Restaurantes", label: "🍽️ Restaurantes" },
  // Add more...
];

export const quickSelectLocations = [
  { value: "São Paulo, SP", label: "🏙️ São Paulo, SP" },
  // Add more...
];
```

---

## Troubleshooting

### Common Issues

#### 1. "0 leads processed, 1 failure in insertion"

**Cause**: Edge Function using Service Role Key instead of user token

**Solution**: Verify Edge Function uses ANON key + Authorization header:

```typescript
const authHeader = req.headers.get('Authorization');
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: authHeader } }
});
```

#### 2. "Email not confirmed" error

**Cause**: Email confirmation enabled in Supabase

**Solution**:
1. Go to Supabase Dashboard → Authentication → Providers → Email
2. Disable "Confirm email" toggle

#### 3. RLS Policy Errors

**Cause**: RLS disabled or policies missing

**Solution**: Run in Supabase SQL Editor:

```sql
-- Enable RLS
ALTER TABLE public.leads_prospeccao ENABLE ROW LEVEL SECURITY;

-- Recreate policies (see Database Schema section)
```

#### 4. Layout Issues (Form Too Narrow)

**Fixed in**: Recent commit

**Solution**: Ensure `src/pages/Index.tsx` uses vertical layout:

```typescript
<div className="max-w-4xl mx-auto space-y-8">
  <ProspectionForm />
  <SearchHistory />
</div>
```

#### 5. Authentication Required Error

**Cause**: User token expired or not passed to Edge Function

**Solution**: Logout and login again, ensure frontend sends Authorization header

### Debugging Tips

1. **Check Browser Console**: F12 → Console tab
2. **Check Network Tab**: F12 → Network tab → Filter by "Fetch/XHR"
3. **Check Supabase Logs**: Dashboard → Edge Functions → prospection → Logs
4. **Check Database Policies**: Dashboard → Database → Policies
5. **Verify Environment Variables**: Check .env file and Supabase secrets

---

## External Integrations

### Google Places API

**Purpose**: Find business leads by niche and location

**Configuration**:
- Set `GOOGLE_PLACES_API_KEY` in Supabase Edge Function secrets
- Enable Places API in Google Cloud Console
- Restrict API key to your Supabase Edge Function IP

**Usage in Edge Function**:
```typescript
const searchQuery = `${niche} em ${location}`;
const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${GOOGLE_API_KEY}`;
```

### Firecrawl API (Optional)

**Purpose**: Enrich lead data by scraping website content

**Configuration**:
- Set `FIRECRAWL_API_KEY` in Supabase Edge Function secrets
- Sign up at https://firecrawl.dev

**Usage**: Automatically extracts website summary if website exists

### Lovable AI Gateway (Optional)

**Purpose**: Generate personalized WhatsApp messages using AI

**Configuration**:
- Set `LOVABLE_API_KEY` in Supabase Edge Function secrets
- Uses Gemini 2.5 Flash model via Lovable AI Gateway

**Message Generation**:
```typescript
const mensagem = await generateWhatsAppMessage(
  nomeEmpresa,
  categoria,
  cidade,
  LOVABLE_API_KEY
);
```

### Evolution API (Optional)

**Purpose**: Actually send WhatsApp messages to leads

**Configuration**:
- Set webhook URL in app settings
- Configure Evolution API instance
- See `GUIA_INTEGRACAO_N8N.md` for full setup

### n8n Integration (Optional)

**Purpose**: Sync leads to Google Sheets, automate workflows

**Documentation**: See `GUIA_INTEGRACAO_N8N.md`

**Endpoints**:
- `GET /sync-all-leads`
- `PATCH /update-lead-status`
- `PUT /update-lead/:leadId`
- `POST /create-lead`
- `GET /metrics`
- `POST /send-whatsapp-and-update-sheets`

---

## Development Guidelines for AI Assistants

### When Making Changes

1. **Always read files before editing**: Use Read tool before Edit tool
2. **Preserve existing patterns**: Follow conventions in similar files
3. **Test critical paths**: Authentication, RLS, Edge Function auth
4. **Update types**: If database schema changes, regenerate types
5. **Check responsive design**: Test mobile, tablet, desktop layouts
6. **Verify multi-tenancy**: Ensure user isolation is maintained
7. **Document breaking changes**: Update relevant .md files

### Code Quality Standards

- **TypeScript**: Use strict typing, avoid `any`
- **Accessibility**: Use semantic HTML, ARIA labels
- **Performance**: Lazy load components, optimize queries
- **Security**: Never expose API keys, validate input
- **Error Handling**: Graceful degradation, user-friendly messages
- **Testing**: Verify before committing

### Pull Request Checklist

- [ ] Code follows existing conventions
- [ ] No TypeScript errors (`npm run build`)
- [ ] No ESLint warnings (`npm run lint`)
- [ ] Responsive design tested
- [ ] Authentication flow works
- [ ] Multi-tenancy preserved
- [ ] Database queries optimized
- [ ] Error handling implemented
- [ ] Toast notifications added
- [ ] Documentation updated

---

## Recent Changes (Last Work Session)

**Date**: 2025-11-16

**Major Fixes**:
1. ✅ Fixed Edge Function authentication (uses user token, not service role)
2. ✅ Removed email confirmation UX issue (direct to login)
3. ✅ Improved prospection form layout (vertical, full width)
4. ✅ Fixed lead insertion errors (multi-tenant working)

**Files Modified**:
- `supabase/functions/prospection/index.ts`
- `src/pages/SignUp.tsx`
- `src/contexts/AuthContext.tsx`
- `src/pages/Index.tsx`

**Testing Guide**: See `GUIA_TESTE_FINAL.md`

---

## Additional Resources

- **Lovable Docs**: https://docs.lovable.dev
- **Supabase Docs**: https://supabase.com/docs
- **shadcn/ui**: https://ui.shadcn.com
- **TanStack Query**: https://tanstack.com/query
- **Tailwind CSS**: https://tailwindcss.com

---

## Support & Contact

For issues or questions:
1. Check existing documentation (README.md, GUIA_*.md files)
2. Review Troubleshooting section above
3. Check Supabase logs and browser console
4. Create detailed bug report with logs

---

**Last Updated**: 2025-11-16
**Generated by**: Claude Code Assistant
**Repository**: prospect-pulse-54
**Version**: 1.0
