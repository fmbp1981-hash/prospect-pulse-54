/**
 * POST /api/admin/organizations/[orgId]/connections/[connectionId]/test — só admin da plataforma.
 *
 * Testa a conexão (qualquer status) contra a API do provedor: ok → active,
 * falha → failing. Devolve { connection, result: { ok, message } } sem segredo.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  adminErrorResponse,
  authorizePlatformAdmin,
  validationErrorResponse,
} from '@/lib/api/admin-route';
import { connectionParamsSchema } from '@/lib/validations/connections';
import { connectionsAdminService } from '@/lib/services/connections-admin.service';

export const runtime = 'nodejs';

type Ctx = { params: { orgId: string; connectionId: string } };

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorizePlatformAdmin();
    if (auth.response) return auth.response;
    const p = connectionParamsSchema.safeParse(params);
    if (!p.success) return validationErrorResponse(p.error);
    const data = await connectionsAdminService.testConnection(p.data.orgId, p.data.connectionId);
    return NextResponse.json({ data, meta: {} });
  } catch (err) {
    return adminErrorResponse(err, 'admin/connection-test');
  }
}
