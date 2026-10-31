#!/usr/bin/env node
/**
 * rotate-connector-key.ts
 *
 * Recifra `organization_connections.secret` e `platform_credentials.secret`
 * para a versão ativa da chave mestra (CONNECTORS_ACTIVE_KEY_VERSION).
 *
 * Uso:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   CONNECTORS_MASTER_KEY_V1=... CONNECTORS_MASTER_KEY_V2=... \
 *   CONNECTORS_ACTIVE_KEY_VERSION=v2 \
 *   npx tsx scripts/rotate-connector-key.ts [--dry-run | --apply]
 *
 * --dry-run (padrão): só conta o que seria recifrado; nada é escrito.
 * --apply: grava. Rode contra produção somente com autorização explícita.
 * Nunca imprime segredos; só ids e contagens.
 */
import { createClient } from '@supabase/supabase-js';
import { decryptSecret, encryptSecret, type EncryptedSecret } from '../src/lib/connectors/crypto/secret-box';

const TABLES = ['organization_connections', 'platform_credentials'] as const;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');

  const activeVersion = process.env.CONNECTORS_ACTIVE_KEY_VERSION?.trim() || 'v1';
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  console.log(`Modo: ${apply ? 'APPLY' : 'DRY-RUN'} | versão ativa: ${activeVersion}`);

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('id, secret');
    if (error) throw new Error(`${table}: ${error.message}`);

    let rotated = 0;
    let skipped = 0;
    for (const row of (data ?? []) as Array<{ id: string; secret: EncryptedSecret | null }>) {
      if (!row.secret || row.secret.v === activeVersion) {
        skipped++;
        continue;
      }
      if (apply) {
        const fresh = await encryptSecret(await decryptSecret(row.secret));
        const { error: upErr } = await supabase.from(table).update({ secret: fresh }).eq('id', row.id);
        if (upErr) throw new Error(`${table} ${row.id}: ${upErr.message}`);
      }
      rotated++;
    }
    console.log(`${table}: ${apply ? 'recifrados' : 'a recifrar'}=${rotated} ignorados=${skipped}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
