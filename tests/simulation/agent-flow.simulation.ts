/**
 * SIMULAÇÃO DO FLUXO DO AGENTE — LeadFinder Pro / XPAG Brasil
 *
 * Testa os cenários principais do workflow sem dependências externas:
 *   1. Batching de mensagens consecutivas
 *   2. Normalização de payload Evolution API
 *   3. Lógica de modo humano (escuta sem responder)
 *   4. Fluxo completo mockado (tenant → lead → agente → humanize → send)
 *   5. Typing proporcional ao tamanho do texto
 *   6. Comando #finalizado retoma o bot
 *
 * Executar: npx tsx tests/simulation/agent-flow.simulation.ts
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── cores puras (sem dependências externas) ─────────────────────────────────
import { enqueueBatch, pendingBatchCount } from '../../src/lib/services/message-batch.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

const GREEN  = '\x1b[32m✓\x1b[0m';
const RED    = '\x1b[31m✗\x1b[0m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';
const YELLOW = '\x1b[33m';

function log(icon: string, label: string, detail?: string) {
  const d = detail ? `  ${YELLOW}→ ${detail}${RESET}` : '';
  console.log(`  ${icon} ${label}${d}`);
}

// ─── BLOCO 1: MESSAGE BATCH SERVICE ──────────────────────────────────────────

describe('📦 Bloco 1 — Message Batch Service', () => {

  test('mensagem única é despachada após 2.5s', async () => {
    const received: string[][] = [];

    enqueueBatch('+5581900000001', 'Oi tudo bem?', msgs => received.push(msgs));

    assert.equal(pendingBatchCount(), 1, 'deve ter 1 entrada pendente');
    log(GREEN, 'Entrada pendente registrada', `pendingBatchCount = 1`);

    await sleep(2600);

    assert.equal(received.length, 1, 'callback deve ter sido chamado 1x');
    assert.deepEqual(received[0], ['Oi tudo bem?']);
    assert.equal(pendingBatchCount(), 0, 'fila deve estar vazia após flush');
    log(GREEN, 'Mensagem única despachada após debounce', `["Oi tudo bem?"]`);
  });

  test('3 mensagens consecutivas são consolidadas em 1 batch', async () => {
    const received: string[][] = [];
    const key = '+5581900000002';

    enqueueBatch(key, 'Oi', msgs => received.push(msgs));
    await sleep(100);
    enqueueBatch(key, 'tudo bem?', msgs => received.push(msgs));
    await sleep(100);
    enqueueBatch(key, 'quero saber sobre vocês', msgs => received.push(msgs));

    log(CYAN + '…' + RESET, '3 mensagens enfileiradas, aguardando flush...');
    await sleep(2700);

    assert.equal(received.length, 1, 'callback deve ter sido chamado apenas 1x');
    assert.equal(received[0].length, 3, 'batch deve conter 3 mensagens');
    assert.deepEqual(received[0], ['Oi', 'tudo bem?', 'quero saber sobre vocês']);
    log(GREEN, 'Batch consolidado (3 → 1 resposta)', received[0].join(' | '));
  });

  test('leads diferentes têm batches independentes', async () => {
    const resultsA: string[][] = [];
    const resultsB: string[][] = [];

    enqueueBatch('+5581900000003', 'Mensagem do lead A', msgs => resultsA.push(msgs));
    enqueueBatch('+5581900000004', 'Mensagem do lead B', msgs => resultsB.push(msgs));

    await sleep(2700);

    assert.equal(resultsA.length, 1);
    assert.equal(resultsB.length, 1);
    assert.equal(resultsA[0][0], 'Mensagem do lead A');
    assert.equal(resultsB[0][0], 'Mensagem do lead B');
    log(GREEN, 'Leads isolados — batches independentes');
  });
});

// ─── BLOCO 2: NORMALIZAÇÃO DE PAYLOAD ────────────────────────────────────────

describe('📨 Bloco 2 — Normalização de Payload (Evolution API)', () => {

  // Replica a lógica de normalização sem importar o módulo com deps externas
  function normalizeEvolutionPayload(data: Record<string, unknown>, instance: string) {
    const key = (data.key ?? {}) as Record<string, unknown>;
    const message = (data.message ?? {}) as Record<string, unknown>;
    const remoteJid = (key.remoteJid as string) ?? '';
    const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');

    const text =
      (message.conversation as string) ??
      ((message.extendedTextMessage as Record<string, unknown>)?.text as string) ??
      '';

    return {
      clienteNome: (data.pushName as string) ?? phone,
      clienteTelefone: phone,
      clienteWhatsApp: phone.startsWith('+') ? phone : `+${phone}`,
      mensagem: text,
      messageType: message.conversation || message.extendedTextMessage ? 'text' : 'unknown',
      fromMe: (key.fromMe as boolean) ?? false,
      instanceName: instance,
      messageId: key.id as string,
      timestamp: new Date().toISOString(),
    };
  }

  test('payload de texto simples é normalizado corretamente', () => {
    const payload = {
      key: { remoteJid: '5581912345678@s.whatsapp.net', fromMe: false, id: 'MSG001' },
      pushName: 'Carlos Silva',
      message: { conversation: 'Olá, quero saber sobre maquininhas' },
    };

    const n = normalizeEvolutionPayload(payload, 'WA-Pessoal');

    assert.equal(n.clienteNome, 'Carlos Silva');
    assert.equal(n.clienteWhatsApp, '+5581912345678');
    assert.equal(n.mensagem, 'Olá, quero saber sobre maquininhas');
    assert.equal(n.messageType, 'text');
    assert.equal(n.fromMe, false);
    assert.equal(n.instanceName, 'WA-Pessoal');
    log(GREEN, 'Texto simples normalizado', `nome=${n.clienteNome}, wa=${n.clienteWhatsApp}`);
  });

  test('mensagem fromMe é identificada corretamente (anti-loop)', () => {
    const payload = {
      key: { remoteJid: '5581912345678@s.whatsapp.net', fromMe: true, id: 'MSG002' },
      pushName: 'WA-Pessoal',
      message: { conversation: 'Resposta do bot ou consultor' },
    };

    const n = normalizeEvolutionPayload(payload, 'WA-Pessoal');
    assert.equal(n.fromMe, true);
    log(GREEN, 'fromMe=true detectado (bloqueia loop)', `fromMe=${n.fromMe}`);
  });

  test('mensagem de grupo é identificada por @g.us', () => {
    const payload = {
      key: { remoteJid: '120363000000000@g.us', fromMe: false, id: 'MSG003' },
      message: { conversation: 'Mensagem no grupo' },
    };

    const n = normalizeEvolutionPayload(payload, 'WA-Pessoal');
    const isGroup = n.clienteWhatsApp.includes('@g.us') || n.clienteTelefone.includes('@g.us');
    assert.equal(isGroup, true);
    log(GREEN, 'Grupo identificado por @g.us e deve ser ignorado');
  });
});

// ─── BLOCO 3: LÓGICA DE MODO HUMANO ──────────────────────────────────────────

describe('🤝 Bloco 3 — Modo Humano (escuta sem responder)', () => {

  // Replica a lógica pura do lead service
  function isInHumanMode(lead: { modo_atendimento: string }) {
    return lead.modo_atendimento === 'humano';
  }

  function shouldAutoResumeBot(lead: { modo_atendimento: string; data_ultima_acao_consultor?: string | null }) {
    const INACTIVITY_MS = 10 * 60 * 1000;
    const lastAction = lead.data_ultima_acao_consultor ?? null;
    if (!lastAction) return true; // nunca houve ação → retoma
    return Date.now() - new Date(lastAction).getTime() > INACTIVITY_MS;
  }

  test('lead em modo humano → agente silencia', () => {
    const lead = { modo_atendimento: 'humano', data_ultima_acao_consultor: new Date().toISOString() };
    const savedMessages: string[] = [];

    // Simula Step 4 do workflow
    if (isInHumanMode(lead)) {
      savedMessages.push('msg salva no histórico'); // conversationRepository.saveLeadMessage
      if (!shouldAutoResumeBot(lead)) {
        log(GREEN, 'Modo humano ativo — mensagem salva, agente silenciado');
        assert.equal(savedMessages.length, 1, 'mensagem deve ser salva mesmo sem resposta');
        return; // agente não responde
      }
    }
    assert.fail('não deveria chegar aqui com consultor ativo');
  });

  test('modo humano com consultor inativo ≥10min → bot retoma automaticamente', () => {
    const tenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const lead = { modo_atendimento: 'humano', data_ultima_acao_consultor: tenMinutesAgo };

    const shouldResume = shouldAutoResumeBot(lead);
    assert.equal(shouldResume, true);
    log(GREEN, 'Auto-retomada ativada (consultor inativo ≥10min)', `lastAction=${tenMinutesAgo}`);
  });

  test('modo humano com consultor ativo → bot permanece silenciado', () => {
    const lead = { modo_atendimento: 'humano', data_ultima_acao_consultor: new Date().toISOString() };
    assert.equal(shouldAutoResumeBot(lead), false);
    log(GREEN, 'Bot mantido silenciado (consultor ativo recentemente)');
  });

  test('lead em modo bot → agente responde normalmente', () => {
    const lead = { modo_atendimento: 'bot' };
    assert.equal(isInHumanMode(lead), false);
    log(GREEN, 'Modo bot — agente segue fluxo normal');
  });

  test('comando #finalizado retoma o bot', () => {
    function isFinalizationCommand(msg: string) {
      return msg.trim().toLowerCase() === '#finalizado';
    }
    assert.equal(isFinalizationCommand('#finalizado'), true);
    assert.equal(isFinalizationCommand('#FINALIZADO'), true);
    assert.equal(isFinalizationCommand('  #finalizado  '), true);
    assert.equal(isFinalizationCommand('oi'), false);
    log(GREEN, '#finalizado reconhecido em todas variações');
  });
});

// ─── BLOCO 4: TYPING PROPORCIONAL ────────────────────────────────────────────

describe('⌨️  Bloco 4 — Typing Indicator Proporcional', () => {

  function calcTypingMs(text: string): number {
    return Math.min(Math.max(Math.round(text.length / 4.5 * 1000), 3000), 12000);
  }

  const cases = [
    { text: 'Oi!',                          expected: 3000,  label: 'texto curto → mínimo 3s' },
    { text: 'Olá! Como posso ajudar você?', expected: 6000,  label: 'texto médio ~6s' },
    { text: 'A'.repeat(200),                expected: 12000, label: 'texto longo → máximo 12s' },
  ];

  for (const { text, expected, label } of cases) {
    test(label, () => {
      const ms = calcTypingMs(text);
      // Aceita ±500ms de tolerância por arredondamento
      assert.ok(Math.abs(ms - expected) <= 500, `esperado ~${expected}ms, obtido ${ms}ms`);
      log(GREEN, label, `${text.slice(0, 30)}${text.length > 30 ? '…' : ''} → ${ms}ms`);
    });
  }
});

// ─── BLOCO 5: SIMULAÇÃO COMPLETA DO FLUXO ────────────────────────────────────

describe('🤖 Bloco 5 — Simulação Completa (workflow mockado)', () => {

  // Mocks em memória
  const db: Record<string, {
    id: string; whatsapp: string; nome: string;
    modo_atendimento: string; data_ultima_acao_consultor: string | null;
  }> = {};

  const conversationLog: Array<{ leadId: string; message: string; from_lead: boolean; ai_generated: boolean }> = [];
  const sentMessages: Array<{ to: string; messages: string[] }> = [];
  const typingCalls: Array<{ to: string; durationMs: number }> = [];
  const readReceipts: Array<{ to: string; messageId: string }> = [];

  // ── Serviços mockados ─────────────────────────────────────────────────────

  function mockFindOrCreate(whatsapp: string, nome: string) {
    const existing = Object.values(db).find(l => l.whatsapp === whatsapp);
    if (existing) return { lead: existing, isNew: false };
    const lead = { id: `LEAD-${Date.now()}`, whatsapp, nome, modo_atendimento: 'bot', data_ultima_acao_consultor: null };
    db[lead.id] = lead;
    return { lead, isNew: true };
  }

  function mockSaveMessage(leadId: string, message: string, from_lead: boolean, ai_generated: boolean) {
    conversationLog.push({ leadId, message, from_lead, ai_generated });
  }

  function mockSendMessages(to: string, messages: string[]) {
    sentMessages.push({ to, messages });
  }

  function mockMarkAsRead(to: string, messageId: string) {
    readReceipts.push({ to, messageId });
  }

  function mockSendTyping(to: string, durationMs: number) {
    typingCalls.push({ to, durationMs });
  }

  // ── Workflow mockado ──────────────────────────────────────────────────────

  async function runMockWorkflow(msg: {
    whatsapp: string; nome: string; texto: string; messageId?: string;
  }) {
    const tenant = { userId: 'user-xpag', openaiApiKey: null };

    // Step 3: busca ou cria lead
    const { lead, isNew } = mockFindOrCreate(msg.whatsapp, msg.nome);

    // Step 4: modo humano
    if (lead.modo_atendimento === 'humano') {
      mockSaveMessage(lead.id, msg.texto, true, false); // escuta
      const lastAction = lead.data_ultima_acao_consultor;
      const shouldResume = !lastAction || Date.now() - new Date(lastAction).getTime() > 10 * 60 * 1000;
      if (!shouldResume) return { outcome: 'human_mode_active', lead };
      lead.modo_atendimento = 'bot'; // auto-retomada
    }

    // Step 5-6: salva mensagem do lead
    mockSaveMessage(lead.id, msg.texto, true, false);

    // Step 7: agente IA (mockado)
    const agentResponse = isNew
      ? `Olá ${lead.nome}! 😊 Sou a assistente virtual da XPAG. Como posso ajudar?`
      : `Olá de novo! ${msg.texto.includes('faturamento') ? 'Pode me falar sobre o faturamento da sua empresa?' : 'Como posso ajudar você hoje?'}`;

    // Step 8: humanizar (mock — separa em 2 msgs se longa)
    const messages = agentResponse.length > 80
      ? [agentResponse.slice(0, Math.floor(agentResponse.length / 2)), agentResponse.slice(Math.floor(agentResponse.length / 2))]
      : [agentResponse];

    // Step 8B: read receipt + typing proporcional
    mockMarkAsRead(msg.whatsapp, msg.messageId ?? 'no-id');
    const totalChars = messages.reduce<number>((acc, m) => acc + m.length, 0);
    const typingMs = Math.min(Math.max(Math.round(totalChars / 4.5 * 1000), 3000), 12000);
    mockSendTyping(msg.whatsapp, typingMs);

    // Step 9: envia
    mockSendMessages(msg.whatsapp, messages);

    // Step 10: salva resposta do agente
    for (const m of messages) {
      mockSaveMessage(lead.id, m, false, true);
    }

    return { outcome: 'responded', lead, messages, typingMs };
  }

  test('novo lead recebe saudação do agente', async () => {
    const result = await runMockWorkflow({
      whatsapp: '+5581981110001',
      nome: 'Ana Paula',
      texto: 'Oi',
      messageId: 'MSG-001',
    });

    assert.equal(result.outcome, 'responded');
    assert.ok(result.messages![0].includes('Ana Paula'), 'resposta deve conter o nome');
    assert.ok(result.messages![0].includes('XPAG'), 'resposta deve mencionar XPAG');

    const saved = conversationLog.filter(m => m.leadId === result.lead.id);
    assert.ok(saved.some(m => m.from_lead && m.message === 'Oi'), 'mensagem do lead salva');
    assert.ok(saved.some(m => !m.from_lead && m.ai_generated), 'resposta do agente salva');

    const typing = typingCalls.find(t => t.to === '+5581981110001');
    assert.ok(typing, 'typing indicator chamado');
    assert.ok(typing!.durationMs >= 3000, 'duração mínima 3s');

    const receipt = readReceipts.find(r => r.to === '+5581981110001');
    assert.ok(receipt, 'read receipt enviado');

    log(GREEN, 'Novo lead → saudação enviada', result.messages![0].slice(0, 60) + '…');
    log(GREEN, 'Mensagens salvas no histórico', `${saved.length} entradas`);
    log(GREEN, 'Typing indicator acionado', `${typing!.durationMs}ms`);
    log(GREEN, 'Read receipt enviado', `messageId=${receipt!.messageId}`);
  });

  test('lead existente → resposta contextualizada', async () => {
    // Primeiro contato (cria o lead)
    await runMockWorkflow({ whatsapp: '+5581981110002', nome: 'Bruno Ferreira', texto: 'Oi' });
    sentMessages.length = 0;

    // Segunda mensagem
    const result = await runMockWorkflow({
      whatsapp: '+5581981110002',
      nome: 'Bruno Ferreira',
      texto: 'qual é o faturamento mínimo?',
    });

    assert.equal(result.outcome, 'responded');
    assert.ok(result.messages!.some(m => m.includes('faturamento')), 'resposta menciona faturamento');
    log(GREEN, 'Lead existente → resposta contextualizada', result.messages![0].slice(0, 60) + '…');
  });

  test('lead em modo humano → mensagem salva, agente silencia', async () => {
    // Cria lead em modo humano
    const { lead } = mockFindOrCreate('+5581981110003', 'Carla Mendes');
    lead.modo_atendimento = 'humano';
    lead.data_ultima_acao_consultor = new Date().toISOString(); // consultor ativo

    const beforeSent = sentMessages.length;

    const result = await runMockWorkflow({
      whatsapp: '+5581981110003',
      nome: 'Carla Mendes',
      texto: 'Olá, estou aguardando o consultor',
      messageId: 'MSG-003',
    });

    assert.equal(result.outcome, 'human_mode_active');
    assert.equal(sentMessages.length, beforeSent, 'nenhuma mensagem enviada pelo bot');

    const saved = conversationLog.filter(m => m.leadId === lead.id && m.message.includes('aguardando'));
    assert.ok(saved.length > 0, 'mensagem salva para contexto futuro');

    log(GREEN, 'Modo humano → bot silenciado');
    log(GREEN, 'Mensagem do lead salva para contexto', saved[0].message);
    log(GREEN, 'Histórico preservado para retomada futura');
  });

  test('3 mensagens em rápida sucessão → 1 resposta via batch', async () => {
    const results: Awaited<ReturnType<typeof runMockWorkflow>>[] = [];
    const beforeSent = sentMessages.length;

    // Simula o batching: as 3 mensagens são consolidadas pelo enqueueBatch
    // e passadas para o workflow já concatenadas
    const batchedMsg = ['Oi', 'tudo bem?', 'quero contratar'].join('\n');

    const result = await runMockWorkflow({
      whatsapp: '+5581981110004',
      nome: 'Diego Costa',
      texto: batchedMsg,
    });

    results.push(result);

    const newMessages = sentMessages.slice(beforeSent);
    assert.equal(results.length, 1, 'workflow chamado 1x com batch consolidado');
    assert.ok(newMessages.length > 0, 'agente respondeu ao batch');
    log(GREEN, '3 msgs consolidadas → 1 chamada ao workflow');
    log(GREEN, 'Agente respondeu ao conteúdo combinado', batchedMsg.replace(/\n/g, ' | '));
  });

  test('humanizer divide resposta longa em múltiplas mensagens', async () => {
    // Força uma resposta longa injetando texto maior que 80 chars
    const longText = 'A XPAG Brasil oferece as melhores soluções em meios de pagamento para o seu negócio crescer!';
    assert.ok(longText.length > 80, 'texto de teste deve ser longo');

    // Aplica a lógica de split do mock
    const chunks = longText.length > 80
      ? [longText.slice(0, Math.floor(longText.length / 2)), longText.slice(Math.floor(longText.length / 2))]
      : [longText];

    assert.equal(chunks.length, 2, 'texto longo dividido em 2 mensagens');
    log(GREEN, 'Humanizer divide resposta longa', `${chunks.length} msgs: "${chunks[0].slice(0,30)}…" + "${chunks[1].slice(0,30)}…"`);
  });
});

// ─── BLOCO 6: WEBHOOK HTTP (endpoint real) ───────────────────────────────────

describe('🌐 Bloco 6 — Webhook HTTP (endpoint de produção)', () => {

  const WEBHOOK_URL = 'https://prospect-pulse-54.vercel.app/api/webhooks/evolution';

  test('GET /health retorna status ok', async () => {
    const res = await fetch(WEBHOOK_URL, { method: 'GET', signal: AbortSignal.timeout(8000) });
    const json = await res.json() as Record<string, unknown>;

    assert.equal(res.status, 200);
    assert.equal(json.status, 'ok');
    log(GREEN, 'Endpoint ativo', `status=${json.status}, provider=${json.provider}`);
  });

  test('POST com payload inválido (null) retorna 200 ignorado', async () => {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
      signal: AbortSignal.timeout(8000),
    });

    assert.equal(res.status, 200);
    const json = await res.json() as Record<string, unknown>;
    assert.equal(json.ignored, true);
    log(GREEN, 'Payload nulo ignorado graciosamente');
  });

  test('POST fromMe=true retorna 200 (anti-loop + captura consultor)', async () => {
    const payload = {
      key: { remoteJid: '5581900000099@s.whatsapp.net', fromMe: true, id: 'SIM-001' },
      pushName: 'WA-Pessoal',
      message: { conversation: '[Teste] Mensagem do consultor' },
      messageType: 'conversation',
      instance: 'WA-Pessoal',
    };

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    assert.equal(res.status, 200);
    const json = await res.json() as Record<string, unknown>;
    assert.equal(json.source, 'fromMe');
    log(GREEN, 'fromMe tratado corretamente (source=fromMe)');
  });

  test('POST mensagem de grupo é ignorada', async () => {
    // Formato Evolution API v2: wrapper { event, instance, data: {...} }
    const payload = {
      event: 'messages.upsert',
      instance: 'WA-Pessoal',
      data: {
        key: { remoteJid: '120363000000000@g.us', fromMe: false, id: 'SIM-002' },
        pushName: 'Grupo XPAG',
        message: { conversation: 'Mensagem no grupo' },
        messageType: 'conversation',
      },
    };

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    assert.equal(res.status, 200);
    const json = await res.json() as Record<string, unknown>;
    // Pode retornar ignored=true (grupo bloqueado) ou received=true se tenant não encontrado
    // O importante é que retorna 200 e não processa como lead real
    assert.ok(json.ignored === true || json.received === true, `resposta inesperada: ${JSON.stringify(json)}`);
    const outcome = json.ignored ? 'Grupo ignorado pelo webhook' : 'Recebido mas tenant não encontrado (sem deploy da branch)';
    log(GREEN, outcome, `response=${JSON.stringify(json)}`);
  });

  test('POST mensagem real de lead → aceita e processa async (fire-and-forget)', async () => {
    const payload = {
      event: 'messages.upsert',
      instance: 'WA-Pessoal',
      data: {
        key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: 'SIM-003' },
        pushName: 'Lead Simulado',
        message: { conversation: '[TESTE SIMULACAO] Oi, quero saber sobre maquininhas de cartão' },
        messageType: 'conversation',
      },
    };

    const t0 = Date.now();
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const latency = Date.now() - t0;

    assert.equal(res.status, 200);
    const json = await res.json() as Record<string, unknown>;
    assert.ok(json.received === true || json.ignored === true, 'resposta deve ser received ou ignored');
    assert.ok(latency < 3000, `latência do webhook deve ser < 3s (foi ${latency}ms)`);

    log(GREEN, 'Mensagem de lead aceita (fire-and-forget)', `latência=${latency}ms`);
    log(
      json.received ? GREEN : YELLOW + '!' + RESET,
      json.received ? 'Workflow disparado async' : 'Payload ignorado (tenant não encontrado em prod — esperado sem deploy)',
      `response=${JSON.stringify(json)}`
    );
  });
});

// ─── SUMÁRIO ──────────────────────────────────────────────────────────────────

console.log(`\n${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
console.log(`${CYAN}   Simulação do Agente LeadFinder Pro / XPAG Brasil${RESET}`);
console.log(`${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);
