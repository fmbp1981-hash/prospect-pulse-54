/**
 * /api/admin/organizations/[orgId]/connections/[connectionId] — só admin da plataforma.
 *
 * PATCH { status: 'active' | 'disabled' } · DELETE. A conexão precisa ser da organização.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  adminErrorResponse,
  authorizePlatformAdmin,
  errorResponse,
  validationErrorResponse,
} from '@/lib/api/admin-route';
import { connectionParamsSchema, updateConnectionStatusSchema } from '@/lib/validations/connections';
import { connectionsAdminService } from '@/lib/services/connections-admin.service';

export const runtime = 'nodejs';

type Ctx = { params: { orgId: string; connectionId: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorizePlatformAdmin();
    if (auth.response) return auth.response;
    const p = connectionParamsSchema.safeParse(params);
    if (!p.success) return validationErrorResponse(p.error);
    const raw = await req.json().catch(() => undefined);
    if (raw === undefined) return errorResponse(400, 'VALIDATION_ERROR', 'Corpo JSON inválido.');
    const body = updateConnectionStatusSchema.safeParse(raw);
    if (!body.success) return validationErrorResponse(body.error);
    const connection = await connectionsAdminService.setStatus(
      p.data.orgId,
      p.data.connectionId,
      body.data.status
    );
    return NextResponse.json({ data: connection, meta: {} });
  } catch (err) {
    return adminErrorResponse(err, 'admin/connection');
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorizePlatformAdmin();
    if (auth.response) return auth.response;
    const p = connectionParamsSchema.safeParse(params);
    if (!p.success) return validationErrorResponse(p.error);
    await connectionsAdminService.deleteConnection(p.data.orgId, p.data.connectionId);
    return NextResponse.json({ data: { id: p.data.connectionId, deleted: true }, meta: {} });
  } catch (err) {
    return adminErrorResponse(err, 'admin/connection');
  }
}
