/**
 * /api/admin/organizations/[orgId]/connections — só admin da plataforma.
 *
 * GET: conexões da organização, sem segredo (hasSecret/secretHint/webhookUrl).
 * PUT: cria/atualiza { category, provider, credentialSource, config, secret? }.
 *      `secret` ausente mantém o atual; campo vazio → 400; `own` novo sem
 *      segredo → 400. Salvar deixa status = pending_test.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  adminErrorResponse,
  authorizePlatformAdmin,
  errorResponse,
  validationErrorResponse,
} from '@/lib/api/admin-route';
import { orgIdParamsSchema, upsertConnectionSchema } from '@/lib/validations/connections';
import { connectionsAdminService } from '@/lib/services/connections-admin.service';

export const runtime = 'nodejs';

type Ctx = { params: { orgId: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorizePlatformAdmin();
    if (auth.response) return auth.response;
    const p = orgIdParamsSchema.safeParse(params);
    if (!p.success) return validationErrorResponse(p.error);
    const connections = await connectionsAdminService.listConnections(p.data.orgId);
    return NextResponse.json({ data: connections, meta: { total: connections.length } });
  } catch (err) {
    return adminErrorResponse(err, 'admin/connections');
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorizePlatformAdmin();
    if (auth.response) return auth.response;
    const p = orgIdParamsSchema.safeParse(params);
    if (!p.success) return validationErrorResponse(p.error);
    const raw = await req.json().catch(() => undefined);
    if (raw === undefined) return errorResponse(400, 'VALIDATION_ERROR', 'Corpo JSON inválido.');
    const body = upsertConnectionSchema.safeParse(raw);
    if (!body.success) return validationErrorResponse(body.error);
    const connection = await connectionsAdminService.saveConnection(p.data.orgId, auth.userId, body.data);
    return NextResponse.json({ data: connection, meta: {} });
  } catch (err) {
    return adminErrorResponse(err, 'admin/connections');
  }
}
