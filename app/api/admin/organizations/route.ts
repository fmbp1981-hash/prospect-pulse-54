/**
 * GET /api/admin/organizations — lista organizações (id, name).
 * Só admin da plataforma (401 sem sessão, 403 sem permissão).
 */
import { NextResponse } from 'next/server';
import { adminErrorResponse, authorizePlatformAdmin } from '@/lib/api/admin-route';
import { connectionsAdminService } from '@/lib/services/connections-admin.service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await authorizePlatformAdmin();
    if (auth.response) return auth.response;
    const organizations = await connectionsAdminService.listOrganizations();
    return NextResponse.json({ data: organizations, meta: { total: organizations.length } });
  } catch (err) {
    return adminErrorResponse(err, 'admin/organizations');
  }
}
