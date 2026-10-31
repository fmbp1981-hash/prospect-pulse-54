/**
 * /api/admin/platform-credentials — só admin da plataforma.
 *
 * GET: credenciais da plataforma sem segredo (hasSecret/secretHint).
 * PUT { provider, secret, config? }: grava (cifrado) a credencial do provedor.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  adminErrorResponse,
  authorizePlatformAdmin,
  errorResponse,
  validationErrorResponse,
} from '@/lib/api/admin-route';
import { upsertPlatformCredentialSchema } from '@/lib/validations/connections';
import { connectionsAdminService } from '@/lib/services/connections-admin.service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await authorizePlatformAdmin();
    if (auth.response) return auth.response;
    const credentials = await connectionsAdminService.listPlatformCredentials();
    return NextResponse.json({ data: credentials, meta: { total: credentials.length } });
  } catch (err) {
    return adminErrorResponse(err, 'admin/platform-credentials');
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await authorizePlatformAdmin();
    if (auth.response) return auth.response;
    const raw = await req.json().catch(() => undefined);
    if (raw === undefined) return errorResponse(400, 'VALIDATION_ERROR', 'Corpo JSON inválido.');
    const body = upsertPlatformCredentialSchema.safeParse(raw);
    if (!body.success) return validationErrorResponse(body.error);
    const credential = await connectionsAdminService.savePlatformCredential(auth.userId, body.data);
    return NextResponse.json({ data: credential, meta: {} });
  } catch (err) {
    return adminErrorResponse(err, 'admin/platform-credentials');
  }
}
