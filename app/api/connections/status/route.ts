/**
 * GET /api/connections/status — qualquer membro autenticado.
 *
 * Status das conexões da PRÓPRIA organização: { category, provider, status, lastTestedAt }[].
 * Nada de config, segredo ou webhook.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminErrorResponse, errorResponse } from '@/lib/api/admin-route';
import { connectionsAdminService } from '@/lib/services/connections-admin.service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Autenticação necessária.');
    const statuses = await connectionsAdminService.statusForUser(user.id);
    return NextResponse.json({ data: statuses, meta: { total: statuses.length } });
  } catch (err) {
    return adminErrorResponse(err, 'connections/status');
  }
}
