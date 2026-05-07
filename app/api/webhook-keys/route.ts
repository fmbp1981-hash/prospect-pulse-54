import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { generateApiKey, hashApiKey } from '@/lib/webhook-keys';

const CreateKeySchema = z.object({
  name: z.string().min(1).max(60),
});

async function getUser() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** GET /api/webhook-keys — lista chaves ativas do usuário */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await db
    .from('webhook_keys' as never)
    .select('id, name, last_used_at, created_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** POST /api/webhook-keys — cria nova chave */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = CreateKeySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const plainKey = generateApiKey();
  const keyHash = hashApiKey(plainKey);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const result = await db
    .from('webhook_keys' as never)
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      key_hash: keyHash,
    })
    .select('id, name, created_at')
    .single();

  const { data, error } = result as { data: Record<string, unknown> | null; error: { message: string } | null };

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Failed to create key' }, { status: 500 });

  // plainKey retornado UMA ÚNICA VEZ — não é armazenado
  return NextResponse.json(
    {
      id: data.id,
      name: data.name,
      created_at: data.created_at,
      key: plainKey,
    },
    { status: 201 }
  );
}
