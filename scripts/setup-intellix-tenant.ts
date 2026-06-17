#!/usr/bin/env node
/**
 * setup-intellix-tenant.ts
 *
 * Configura o tenant IntelliX no LeadFinder Pro (produção).
 * Executa as tarefas T1, T4, T5, T7, T8 do CONFIG_CLAUDE_CODE_LeadFinderPro.md.
 *
 * Uso:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   OPENAI_API_KEY=sk-... \
 *   INTELLIX_CONSULTANT_WHATSAPP=55819XXXXXXXX \
 *   npx tsx scripts/setup-intellix-tenant.ts
 *
 * Variável opcional:
 *   INTELLIX_USER_PASSWORD=<senha>  (default: cria com senha temporária randômica)
 *
 * Segurança:
 * - Todas as escritas são escopadas ao user_id resolvido de contato@intellixai.com.br.
 * - tenant_id='intellix' em todos os leads e configurações.
 * - Idempotente: pode ser rodado novamente sem duplicar dados (usa upsert/check-before-insert).
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? '';
const CONSULTANT_WHATSAPP = process.env.INTELLIX_CONSULTANT_WHATSAPP ?? '';
const INTELLIX_EMAIL = 'contato@intellixai.com.br';
const INTELLIX_PASSWORD = process.env.INTELLIX_USER_PASSWORD ?? `IntelliX@${randomUUID().slice(0, 8)}`;
const TENANT_ID = 'intellix';

// ─── Supabase admin client ────────────────────────────────────────────────────

function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(step: string, msg: string, data?: unknown) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${step}] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
}

function err(step: string, msg: string, e?: unknown) {
  console.error(`[ERROR] [${step}] ${msg}`, e);
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text.slice(0, 8191),
      model: 'text-embedding-3-small',
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Embeddings error: ${response.status} ${errText}`);
  }
  const data = await response.json() as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  // Batch in groups of 96 (OpenAI limit)
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += 96) {
    const batch = texts.slice(i, i + 96);
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: batch.map((t) => t.slice(0, 8191)),
        model: 'text-embedding-3-small',
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI Embeddings batch error: ${response.status} ${errText}`);
    }
    const data = await response.json() as { data: Array<{ embedding: number[]; index: number }> };
    const sorted = data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    results.push(...sorted);
    if (i + 96 < texts.length) {
      await new Promise((r) => setTimeout(r, 1000)); // rate limit pause
    }
  }
  return results;
}

// Split markdown into chunks by ## heading (one chunk per company for the dossier)
function splitByH2(content: string): string[] {
  const lines = content.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ') && current.length > 0) {
      const chunk = current.join('\n').trim();
      if (chunk.length > 50) chunks.push(chunk);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    const chunk = current.join('\n').trim();
    if (chunk.length > 50) chunks.push(chunk);
  }
  return chunks;
}

// Standard character-based chunking (used for institutional docs)
function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.slice(start, end);
    if (end < text.length) {
      const lastPara = chunk.lastIndexOf('\n\n');
      const lastSent = Math.max(chunk.lastIndexOf('. '), chunk.lastIndexOf('! '), chunk.lastIndexOf('? '));
      const bp = lastPara > chunkSize * 0.5 ? lastPara : lastSent > chunkSize * 0.5 ? lastSent + 1 : -1;
      if (bp > 0) chunk = text.slice(start, start + bp + 1);
    }
    chunks.push(chunk.trim());
    start += chunk.length - overlap;
  }
  return chunks.filter((c) => c.length > 50);
}

// ─── T1 — Usuário e user_settings ─────────────────────────────────────────────

async function setupUser(): Promise<string> {
  const supabase = getAdminClient();
  log('T1', `Resolvendo usuário ${INTELLIX_EMAIL}`);

  // 1. Check if user already exists
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);

  const existing = (listData?.users ?? []).find(
    (u: { email?: string | null }) => u.email?.toLowerCase() === INTELLIX_EMAIL
  );

  let userId: string;

  if (existing) {
    userId = existing.id;
    log('T1', `Usuário já existe: ${userId}`);
  } else {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: INTELLIX_EMAIL,
      password: INTELLIX_PASSWORD,
      email_confirm: true,
    });
    if (createErr) throw new Error(`createUser: ${createErr.message}`);
    userId = created.user!.id;
    log('T1', `Usuário criado: ${userId} | senha temporária: ${INTELLIX_PASSWORD}`);
    log('T1', '⚠️  Guarde a senha acima ou defina INTELLIX_USER_PASSWORD antes de rodar.');
  }

  // 2. Upsert user_settings
  const settingsPayload = {
    user_id: userId,
    company_name: 'IntelliX.AI',
    role: 'admin',
    provider: 'meta',
    consultant_whatsapp: CONSULTANT_WHATSAPP || null,
    integration_configured: true,
    pending_setup: false,
    updated_at: new Date().toISOString(),
  };

  const { error: settingsErr } = await supabase
    .from('user_settings')
    .upsert(settingsPayload, { onConflict: 'user_id' });

  if (settingsErr) throw new Error(`upsert user_settings: ${settingsErr.message}`);
  log('T1', 'user_settings configurado', { provider: 'meta', company: 'IntelliX.AI' });

  return userId;
}

// ─── T4 — 114 leads ───────────────────────────────────────────────────────────

interface LeadRow {
  nome: string;
  empresa: string;
  categoria: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  resumo_analitico: string | null;
  modo_atendimento: string;
}

// Leads carregados do arquivo verificado scripts/intellix-leads.json
// (gerado a partir de IntelliX_Leads_Consolidado.xlsx, aba Contatos — 111 leads reais).
const LEADS_DATA: LeadRow[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "scripts", "intellix-leads.json"), "utf-8")
).map((l: Record<string, unknown>) => ({
  nome: l.nome as string,
  empresa: l.empresa as string,
  categoria: (l.categoria as string) ?? null,
  whatsapp: (l.whatsapp as string) ?? null,
  email: (l.email as string) ?? null,
  instagram: (l.instagram as string) ?? null,
  resumo_analitico: (l.resumo_analitico as string) ?? null,
  modo_atendimento: (l.modo_atendimento as string) ?? "bot",
}));

async function importLeads(userId: string): Promise<void> {
  const supabase = getAdminClient();
  log('T4', `Importando ${LEADS_DATA.length} leads para userId=${userId}`);

  // Check existing leads for this tenant to avoid duplicates
  const { data: existing } = await supabase
    .from('leads_prospeccao')
    .select('empresa')
    .eq('user_id', userId)
    .eq('tenant_id', TENANT_ID);

  const existingEmpresas = new Set((existing ?? []).map((r: { empresa: string }) => r.empresa.toLowerCase().trim()));
  const toInsert = LEADS_DATA.filter((l) => !existingEmpresas.has(l.empresa.toLowerCase().trim()));

  if (toInsert.length === 0) {
    log('T4', 'Todos os leads já existem — nada a inserir.');
    return;
  }

  log('T4', `Inserindo ${toInsert.length} novos leads (${LEADS_DATA.length - toInsert.length} já existiam)`);

  const rows = toInsert.map((l) => ({
    id: randomUUID(),
    lead: l.nome,
    empresa: l.empresa,
    categoria: l.categoria,
    whatsapp: l.whatsapp,
    email: l.email,
    instagram: l.instagram,
    resumo_analitico: l.resumo_analitico,
    origem: 'evento_encontro_relacionamento',
    status: 'Novo',
    estagio_pipeline: 'Novo',
    status_msg_wa: 'not_sent',
    modo_atendimento: l.modo_atendimento,
    user_id: userId,
    tenant_id: TENANT_ID,
    data_ultima_interacao: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  // Insert in batches of 50
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase.from('leads_prospeccao').insert(batch);
    if (error) throw new Error(`Insert leads batch ${i}: ${error.message}`);
    log('T4', `Batch ${i / 50 + 1}: inseridos ${batch.length} leads`);
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    id: randomUUID(),
    user_id: userId,
    action: 'IMPORT_LEADS',
    entity_type: 'lead',
    details: { fonte: 'encontro_relacionamento', total: toInsert.length, tenant_id: TENANT_ID },
    created_at: new Date().toISOString(),
  });

  log('T4', `✓ ${toInsert.length} leads importados`);
}

// ─── T5 — Agent config (Bia) ──────────────────────────────────────────────────

async function setupAgentConfig(userId: string): Promise<string> {
  const supabase = getAdminClient();
  log('T5', 'Configurando agent_configs (Bia v1)');

  // Deactivate any existing configs for this user
  await supabase
    .from('agent_configs')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true);

  // Read the prompt from the source file (embedded as string)
  const systemPrompt = BIA_SYSTEM_PROMPT;

  const { data, error } = await supabase
    .from('agent_configs')
    .insert({
      id: randomUUID(),
      user_id: userId,
      name: 'IntelliX SDR — Bia v1',
      system_prompt: systemPrompt,
      prompt_version: 'custom',
      model: 'gpt-4.1',
      temperature: 0.6,
      max_iterations: 5,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw new Error(`Insert agent_configs: ${error.message}`);
  const agentConfigId = data.id as string;
  log('T5', `✓ agent_configs criado: ${agentConfigId}`);
  return agentConfigId;
}

// Bia system prompt (mirrors src/lib/ai/prompts/system-prompt.intellix.v1.ts)
const BIA_SYSTEM_PROMPT = `# Identidade

Você é Bia, assistente de desenvolvimento comercial (SDR) da IntelliX.AI.

Sua missão é única e não negociável: criar curiosidade genuína sobre o que a IntelliX faz, entender a realidade operacional da empresa do lead e conseguir que ele aceite uma conversa rápida (20 minutos) com Felipe, o fundador.

Você NÃO conduz reuniões, NÃO fecha negócios, NÃO apresenta preços, NÃO envia tabelas ou propostas, NÃO descreve o diagnóstico Canvas IntelliX em detalhes. Se o lead pedir qualquer um desses itens, registre o interesse e transfira para Felipe usando a ferramenta de transferência.

# Empresa: IntelliX.AI

Agência de implementação de IA em Recife (PE), especializada em resultados mensuráveis para PMEs brasileiras com faturamento entre R$500 mil e R$20 milhões.

Tagline: "Resultado visível. Tecnologia invisível."
Posicionamento: "Usamos IA inclusive para decidir quando não usar IA."

Linhas de produto:
- RADAR.AI: diagnóstico de processos + inteligência de mercado. Mostra onde a IA gera ROI em 72h.
- FORJA.AI: automação de processos com IA (WhatsApp, CRM, integrações). Reduz trabalho manual repetitivo em até 60%.
- TRILHA.AI: treinamento de equipes em IA aplicada. Time produtivo com IA em 30 dias.
- VIRADA.AI / Virada Inteligente: imersão de 4h para o empresário entender e começar a usar IA.
- Soluções sob medida: projetos com KPI definido pelo cliente.

Vocabulário banido (nunca use): "revolucionar", "disruptivo", "democratizar", "transformação digital", "revolucionário". Comunique em resultados práticos, nunca em promessas genéricas.

# Contexto do contato

Todos os leads desta campanha estiveram no evento "Encontro & Relacionamento", de networking de empreendedores, organizado por Dirceu Cordeiro. Felipe (fundador da IntelliX) também participou. Esse é o gatilho de reconhecimento: a conversa é uma continuação de um encontro presencial, não um contato frio.

A primeira mensagem (template) já foi enviada em nome do Felipe. Quando o lead responde, você entra como assistente do Felipe.

# Tom e estilo

- Caloroso, direto e profissional. Sem formalidade excessiva, sem intimidade forçada.
- Mensagens curtas (a plataforma divide respostas longas automaticamente). Prefira 2 a 4 linhas.
- Português do Brasil, sentence case. Sem emoji em excesso (no máximo 1, e só se o lead usar).
- Sem listas, bullets ou markdown nas mensagens de WhatsApp. Texto corrido.
- Espelhe levemente o nível de informalidade do lead, nunca mais informal que ele.

# Fluxo de atendimento — 5 etapas

## ETAPA 1 — Acolhimento (primeira resposta do lead)
Se positivo (curioso, perguntou algo): agradeça, diga que o Felipe pediu para continuar a conversa, e pergunte a maior dor operacional da empresa hoje.
Se cauteloso: deixe claro que você não vai mandar proposta nem catálogo, que são só 2 perguntas para ver se faz sentido conversar.
Se pediu para sair: confirme a remoção, agradeça e use a ferramenta de atualização para marcar follow-up/opt-out. Não contate mais.

## ETAPA 2 — Qualificação (máximo 3 perguntas, uma por mensagem)
1. Dor: qual processo é o mais lento, manual ou difícil de controlar hoje.
2. Escala: quantas pessoas atuam nessa área.
3. Urgência: está doendo agora ou é melhoria para fazer com calma.
Atualize o lead com a ferramenta a cada avanço (empresa confirmada, dor, etc.).

## ETAPA 3 — Posicionamento por segmento
Depois de ouvir a dor, conecte ao produto certo (use o segmento do lead, campo "categoria"):
- Construção/Imobiliário → FORJA.AI: qualificação de leads + follow-up automático.
- Jurídico → FORJA.AI: triagem de casos + atendimento fora do horário.
- Saúde/Clínicas → FORJA.AI: confirmação de consultas + retenção de pacientes.
- Atacado/Distribuição/Food Service → FORJA.AI: pedidos no WhatsApp + cobrança/inadimplência.
- Tecnologia/TI → RADAR.AI + parceria: prospecção e suporte sem sobrecarregar o time.
- Agências/Marketing → FORJA.AI: relatório automático + onboarding de clientes.
- Consultoria/Financeiro/Seguros → RADAR.AI: qualificação e nutrição de leads no meio do funil.
- Energia Solar → FORJA.AI: qualificação por conta de energia + follow-up pós-visita.
- Demais segmentos → VIRADA.AI como porta de entrada, ou conversa de diagnóstico com Felipe.

## ETAPA 4 — Decisão de qualificação
Considere o lead QUALIFICADO quando atender pelo menos 2 de 3: (a) dor operacional clara; (b) é decisor (sócio, diretor, responsável pela área); (c) empresa com operação ativa (não autônomo sem equipe).
- Qualificado → convide para a conversa de 20 min com Felipe e transfira (ETAPA 5).
- Não qualificado agora (sem dor clara, só curiosidade, ou não é decisor) → ofereça a Virada Inteligente / material e marque follow-up. Não force.

## ETAPA 5 — Transferência para Felipe
Convide: "Felipe tem uma agenda para quem veio do Encontro do Dirceu. São 20 minutos, ele analisa a operação da sua empresa ao vivo e já diz onde a IA gera resultado real. Essa semana ou na próxima?"
Quando o lead aceitar (ou pedir para falar com humano a qualquer momento), use IMEDIATAMENTE a ferramenta de transferência para o consultor. Nunca diga que transferiu sem executar a ferramenta.

# Regras absolutas

1. Nunca diga que transferiu sem EFETIVAMENTE chamar a ferramenta de transferência.
2. Lead pede humano → transferir IMEDIATAMENTE, sem questionar, em qualquer etapa.
3. Use sempre os dados do contexto injetado (lead, empresa, histórico). Nunca invente casos, números ou clientes.
4. Nunca minta sobre ações realizadas.
5. Atualize o lead a cada avanço relevante com a ferramenta de atualização.
6. Não repita a apresentação para leads que já estão em conversa.
7. Nunca apresente preço. Se perguntarem: "Para te passar um número que faça sentido preciso entender melhor sua operação — é o que o Felipe faz na conversa de 20 minutos."
8. Nunca pressione. "Não agora" é resposta válida: agradeça e encerre com gentileza.`;

// ─── T7 — RAG documents ───────────────────────────────────────────────────────

async function setupRAG(userId: string, agentConfigId: string): Promise<void> {
  if (!OPENAI_KEY) {
    log('T7', '⚠️  OPENAI_API_KEY não fornecida — pulando ingestão de RAG. Faça o upload manual via /settings.');
    return;
  }

  const supabase = getAdminClient();

  // RAG docs: filename → content (read from project root at script invocation time)
  const scriptDir = path.join(process.cwd());
  const ragDir = path.join(scriptDir, 'scripts', 'rag-docs');

  const docsToIngest = [
    { filename: 'RAG_Leads_Dossie_IntelliX.md', chunker: 'h2' as const },
    { filename: 'RAG_INST_01_Identidade_Tom_de_Voz.md', chunker: 'char' as const },
    { filename: 'RAG_INST_02_Produtos_ICP_Personas.md', chunker: 'char' as const },
    { filename: 'RAG_INST_03_Objecoes_e_Funil.md', chunker: 'char' as const },
  ];

  for (const doc of docsToIngest) {
    const filePath = path.join(ragDir, doc.filename);
    if (!fs.existsSync(filePath)) {
      log('T7', `⚠️  Arquivo não encontrado: ${filePath}. Copie os arquivos RAG para scripts/rag-docs/ antes de rodar.`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    log('T7', `Ingerindo ${doc.filename} (${content.length} chars)`);

    // 1. Insert document record
    const { data: docRecord, error: docErr } = await supabase
      .from('rag_documents')
      .insert({
        id: randomUUID(),
        user_id: userId,
        agent_config_id: agentConfigId,
        filename: doc.filename,
        content,
        mimetype: 'text/markdown',
        status: 'processing',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (docErr) { err('T7', `Insert doc ${doc.filename}: ${docErr.message}`); continue; }
    const docId = docRecord.id as string;

    // 2. Chunk
    const chunks = doc.chunker === 'h2' ? splitByH2(content) : chunkText(content);
    log('T7', `  → ${chunks.length} chunks`);

    // 3. Embeddings in batch
    try {
      const embeddings = await generateEmbeddingsBatch(chunks);

      // 4. Insert chunks
      const chunkRows = chunks.map((chunk, i) => ({
        id: randomUUID(),
        document_id: docId,
        user_id: userId,
        content: chunk,
        chunk_index: i,
        embedding: JSON.stringify(embeddings[i]),
        created_at: new Date().toISOString(),
      }));

      const { error: chunkErr } = await supabase
        .from('rag_document_chunks')
        .insert(chunkRows);

      if (chunkErr) {
        await supabase.from('rag_documents').update({ status: 'error' }).eq('id', docId);
        err('T7', `Insert chunks ${doc.filename}: ${chunkErr.message}`);
        continue;
      }

      // 5. Update status
      await supabase
        .from('rag_documents')
        .update({ status: 'ready', chunk_count: chunks.length, updated_at: new Date().toISOString() })
        .eq('id', docId);

      log('T7', `  ✓ ${doc.filename}: ${chunks.length} chunks ingeridos`);
    } catch (e) {
      await supabase.from('rag_documents').update({ status: 'error' }).eq('id', docId);
      err('T7', `Embeddings ${doc.filename}`, e);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== IntelliX Tenant Setup ===\n');

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Variáveis obrigatórias: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!CONSULTANT_WHATSAPP) {
    console.warn('⚠️  INTELLIX_CONSULTANT_WHATSAPP não definido — consultor_whatsapp ficará nulo.');
  }

  try {
    // T1 — Usuário e user_settings
    const userId = await setupUser();

    // T4 — 114 leads
    await importLeads(userId);

    // T5 — Agent config (Bia)
    const agentConfigId = await setupAgentConfig(userId);

    // T7 — RAG
    await setupRAG(userId, agentConfigId);

    console.log('\n=== Setup concluído ===');
    console.log(`user_id: ${userId}`);
    console.log(`agent_config_id: ${agentConfigId}`);
    console.log(`tenant_id: ${TENANT_ID}`);
    console.log('\nPróximos passos manuais:');
    console.log('  T2: Preencher business_phone_number_id e business_access_token em user_settings');
    console.log('  T6: Cadastrar 9 templates no Meta Business Manager (ver docs/intellix-templates.md)');
    console.log('  T9: Agendar disparo em massa via Bulk WhatsApp no painel (ver docs/intellix-templates.md)');
    console.log('  Secrets: configurar META_WA_TOKEN, META_WA_PHONE_NUMBER_ID, OPENAI_API_KEY, CRON_SECRET na Vercel');
  } catch (e) {
    err('main', 'Falha no setup', e);
    process.exit(1);
  }
}

main();
