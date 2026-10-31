/**
 * GET   /api/campaigns/[id] — detalhes + envios da campanha
 * PATCH /api/campaigns/[id] — atualiza campanha (somente draft; allowlist Zod .strict())
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { campaignPatchSchema } from '@/lib/validations/campaign.validation';

export const runtime = 'nodejs';

async function getUser(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = db();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaign, error } = await (svc as any)
    .from('campaigns')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (error || !campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sends } = await (svc as any)
    .from('campaign_sends')
    .select('id, recipient, lead_id, status, sent_at, error, created_at')
    .eq('campaign_id', params.id)
    .order('created_at', { ascending: false })
    .limit(500);

  return NextResponse.json({ campaign, sends: sends ?? [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = db();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (svc as any)
    .from('campaigns')
    .select('status')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
  if (existing.status !== 'draft') {
    return NextResponse.json({ error: 'Só é possível editar campanhas em rascunho' }, { status: 400 });
  }

  const parsed = campaignPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Campos inválidos para edição de campanha' }, { status: 400 });
  }
  const update = { ...parsed.data, updated_at: new Date().toISOString() };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc as any)
    .from('campaigns')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
