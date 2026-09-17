import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Config mínima — cache incremental (ISR/R2) fica pra depois que o bucket R2
// for provisionado (ver Fase 6/8 de CLOUDFLARE_MIGRATION_PLAN.md). Sem essa
// config, o adapter usa o cache padrão (em memória, não persistente entre
// invocações), suficiente pra validar o build agora.
export default defineCloudflareConfig({});
