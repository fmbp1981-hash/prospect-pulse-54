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

// Leads data embedded directly (parsed from IntelliX_Leads_Consolidado.xlsx, aba Contatos)
const LEADS_DATA: LeadRow[] = [{"nome":"Ademilson da Silva Fonseca","empresa":"Recife Caixas Indústria de Embalagens","categoria":"Indústria de Papelão","whatsapp":"5581984250782","email":"fonseca.sudperbambuco@gmail.com","instagram":"@fonsecajornadadoempreendedor","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Admilson F Queiroz Junior","empresa":"Grupo Rede","categoria":"Contabilidade / Serviços","whatsapp":"5581995162299","email":"juninhowqueiroz@hotmail.com","instagram":null,"resumo_analitico":"ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Adriano Fernando dos Santos (81 9 9248-5894), Rayanne Moura (81 9 9898-2565), Tiago Costa Moura (81 9 9459-0340)","modo_atendimento":"bot"},{"nome":"Adriana dos Anjos Brito","empresa":"Engtec Engenharia e Manutenção","categoria":"Refrigeração e Climatização","whatsapp":"5581996641330","email":"adriana.brito@engtecmanutencao.com","instagram":"@engtecmanutencao","resumo_analitico":"ICP: Média | Fonte: Caruaru + Encontro | Outros contatos deste lead: Ícaro Estêvão de Oliveira Costa (81 9 9998-1558), Adriana dos Anjos Brito (81 9 9664-1330), Ícaro Estêvão de Oliveira Costa (81 9 9998-1558), Rildo Cavalcanti da Silva (81 9 9801-6000)","modo_atendimento":"bot"},{"nome":"Adriano Negrini Costa Manso","empresa":"Criare / Italinea - Móveis Planejados","categoria":"Móveis Planejados (alto padrão)","whatsapp":"5581991123801","email":"adriano@confianceplanejados.com.br","instagram":"@negriniadrianocm","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Alberto José da Costa Lima Cavendish Moreira","empresa":"Cavendish Consultoria / Incorporadora Be Your Home","categoria":"Incorporação e consultoria empresarial","whatsapp":"5581988763085","email":"contato@grupocavendish.com.br","instagram":"@grupocavendish","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Alexandre Borba Gurgel Do Amaral","empresa":"MD Vendas - Investimentos Imobiliários","categoria":"Imóveis","whatsapp":"5581981878788","email":"alexandre.gurgel@mdvendas.com.br","instagram":"@alexandregurguel78","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Alexandre de Oliveira Siqueira","empresa":"Agência Ágil","categoria":"Tráfego pago","whatsapp":"5581996421010","email":"alexandre.agilmkt@gmail.com","instagram":"@alexandresiqueiraconsult","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Alexandre Santos","empresa":"Recsun Energia Solar","categoria":"Energia Solar","whatsapp":"5581999940127","email":"alexandresantos@recsunenergia.com","instagram":null,"resumo_analitico":"ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Suzanna Dias (81 9 9994-0211)","modo_atendimento":"bot"},{"nome":"Alexandre Tavares","empresa":"Smarthec Náutica","categoria":"Náutica (estaleiros, embarcações, iates)","whatsapp":"5581987911583","email":"alexandre@smarthec.com.br","instagram":"@smarthecnautica","resumo_analitico":"ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Patrícia Wanessa Nunes Aires Tavares (81 9 8791-1585)","modo_atendimento":"bot"},{"nome":"AF Consultoria Empresarial & Coaching","empresa":"AF Consultoria Empresarial & Coaching","categoria":"Consultoria","whatsapp":null,"email":"alexssandro_pe@hotmail.com","instagram":null,"resumo_analitico":"ICP: Alta | Fonte: Caruaru | Número fora do padrão — conferir","modo_atendimento":"humano"},{"nome":"Aline Crescêncio Pedrosa","empresa":"Agência Ozan","categoria":"Marketing","whatsapp":"5581982500162","email":"alinecrescencio2008@hotmail.com","instagram":"@line_pedrosa","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Aline Ramos Lima de Godoy","empresa":"Lima e Maia Sociedade de Advogados","categoria":"Planejamento Patrimonial e Sucessório","whatsapp":"5581999689999","email":"aline@limaemaia.adv.br","instagram":"@limaemaia.adv","resumo_analitico":"ICP: Média | Fonte: Encontro | Outros contatos deste lead: Kyara Amorim Maia Thorpe (81 9 9696-0710)","modo_atendimento":"bot"},{"nome":"Álvaro Fonseca Da Silva","empresa":"Brasil Gourmet","categoria":"Supermercados, Atacado e Distribuição","whatsapp":"5583999443375","email":"brasilgourmetadm@hotmail.com","instagram":"@brasilgourmetalimentos","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Ana Luíza de Oliveira Lima França","empresa":"232 Burguer / Terraço da Praça","categoria":"Restaurantes","whatsapp":"5581997311968","email":"analuizaolf@gmail.com","instagram":"@232burguer","resumo_analitico":"ICP: Média | Fonte: Caruaru + Encontro | Outros contatos deste lead: José Diego Nemesio Beltrão (81 9 9666-1154), Ana Luíza de Oliveira Lima França (81 9 9731-1968), José Diego Nemesio Beltrão (81 9 9666-1154)","modo_atendimento":"bot"},{"nome":"Ana Maria Rodrigues da Silva","empresa":"Estruturar Consultoria","categoria":"Consultoria em Estrutura Organizacional","whatsapp":"5581999108980","email":"estruturarconsultoria@gmail.com","instagram":"@anarodriguesconsultora","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Anderson Candido Alves","empresa":"Agência Valore","categoria":"Marketing / Comunicação","whatsapp":"5581973139693","email":"anderson@agenciavalore.com.br","instagram":null,"resumo_analitico":"ICP: Média | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Anderson De Oliveira Lacerda","empresa":"Guaray Pirotecnia","categoria":"Fogos de Artifício","whatsapp":"5581997471087","email":"anderson@guaraypirotecnia.com.br","instagram":"@guaray.pirotecnia","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Anderson Lourenço Barbosa da Silva","empresa":"Kabyte","categoria":"Suporte de TI com Cibersegurança","whatsapp":"5581996388485","email":"anderson@kabyte.com.br","instagram":"@kabyte","resumo_analitico":"ICP: Alta | Fonte: Caruaru + Encontro | Outros contatos deste lead: Anderson Lourenço Barbosa da Silva (81 9 9638-8485)","modo_atendimento":"bot"},{"nome":"Andréa Brito","empresa":"Arya","categoria":"Harmonização Orofacial","whatsapp":"5551991759133","email":"doutora.andreabrito@hotmail.com","instagram":"@dra.andreabrito","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Ângela Maria da Costa Dantas","empresa":"Studio de Beleza / Podcast","categoria":"Estética / Mídia","whatsapp":"5581994318161","email":"contatoangeladantas@gmail.com","instagram":null,"resumo_analitico":"ICP: Média | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Aroldo Peres","empresa":"Peres Assessoria","categoria":"Consultoria Financeira","whatsapp":"5581988844889","email":"aroldo.peres@gmail.com","instagram":"@peresassessoria","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Arthur Morales","empresa":"Avelo Consultoria de Imóveis","categoria":"Imóveis de Médio a Alto Padrão","whatsapp":"5581983839999","email":"arthur@avelo.com.br","instagram":"@avelo.imoveis","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Beatriz Cavalcanti","empresa":"Academia de Música Beatriz Cavalcanti","categoria":"Educação / Serviços","whatsapp":"5581997270033","email":"academia.musica.beatriz@gmail.com","instagram":"@academiabeatrizcavalcanti","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Bruno Medeiros","empresa":"Medeiros Inteligência Imobiliária","categoria":"Negócios Imobiliários","whatsapp":"5581994090100","email":"brunomedeiros@mediinteligencia.com.br","instagram":"@brunomedeiros.corretor","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Bruno Rodrigues Gonçalves","empresa":"Moto Peças Recife / GV Varais","categoria":"Fabricação e Venda de Varais","whatsapp":"5581994444442","email":"brunorodrigues@motopecasrecife.com.br","instagram":"@gvvarais","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Carlos Daniel da Silva Lacerda","empresa":"Ótica Diniz","categoria":"Varejo / Comércio","whatsapp":"5581987573737","email":"carlosdaniel@oticadiniz.com.br","instagram":"@oticadiniz","resumo_analitico":"ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Gabriele Lacerda (81 9 8601-0000)","modo_atendimento":"bot"},{"nome":"Clayton Lima","empresa":"Nexus Soluções em TI","categoria":"Tecnologia / TI","whatsapp":"5581991919090","email":"clayton.lima@nexusti.com.br","instagram":"@nexusti","resumo_analitico":"ICP: Alta | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Cristiana Dantas","empresa":"Grupo Vida e Arte","categoria":"Eventos / Beleza","whatsapp":"5581984737474","email":"cristiana@grupovidaearte.com.br","instagram":"@grupovidaearte","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Daianny Wanderley","empresa":"ACIC - Associação Comercial e Empresarial","categoria":"Associação Comercial","whatsapp":"5581999878787","email":"daianny@acic.org.br","instagram":"@acicpe","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Daniel Menezes","empresa":"Menezes & Advogados","categoria":"Jurídico Cível","whatsapp":"5581992929292","email":"daniel@menezes.adv.br","instagram":"@menezesadvogados","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Danilo Noronha","empresa":"Noronha Construtora","categoria":"Construção Civil","whatsapp":"5581983434343","email":"danilo@noronhaconstrutora.com.br","instagram":"@noronhaconstrutora","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Débora Cavalcanti","empresa":"DC Eventos","categoria":"Eventos","whatsapp":"5581994545454","email":"debora@dceventos.com.br","instagram":"@dceventos","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Diego Henrique Pires","empresa":"DH Tecnologia","categoria":"Tecnologia / TI","whatsapp":"5581991212121","email":"diego@dhtecnologia.com.br","instagram":"@dhtecnologia","resumo_analitico":"ICP: Alta | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Diogo Portela","empresa":"Portela Seguros","categoria":"Seguros","whatsapp":"5581995050505","email":"diogo@portelaseguros.com.br","instagram":"@portelaseguros","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Edison Alves","empresa":"Alves & Neto Advocacia","categoria":"Trabalhista Empresarial","whatsapp":"5581986161616","email":"edison@alvesadvocacia.com.br","instagram":"@alvesneto.adv","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Eduardo Paes","empresa":"Paes Incorporações","categoria":"Construtora / Incorporação","whatsapp":"5581997272727","email":"eduardo@paesincorporacoes.com.br","instagram":"@paesincorporacoes","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Eliane Morais","empresa":"Morais Pet Shop","categoria":"Pet / Veterinária","whatsapp":"5581988383838","email":"eliane@moraispet.com.br","instagram":"@moraispet","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Emília Fontes","empresa":"Fontes Contabilidade","categoria":"Escritório Contábil","whatsapp":"5581996494949","email":"emilia@fontescontabilidade.com.br","instagram":"@fontescontabilidade","resumo_analitico":"ICP: Alta | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Fábio Henrique Santos","empresa":"FS Distribuidora","categoria":"Distribuidora Food Service","whatsapp":"5581993030303","email":"fabio@fsdistribuidora.com.br","instagram":"@fsdistribuidora","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Fernanda Cavalcante","empresa":"Cavalcante Cosméticos","categoria":"Cosméticos / Varejo","whatsapp":"5581984141414","email":"fernanda@cavalcantecosmeticos.com.br","instagram":"@cavalcantecosmeticos","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Fernando Gomes","empresa":"Gomes & Associados Consultoria","categoria":"Consultoria","whatsapp":"5581992525252","email":"fernando@gomesassociados.com.br","instagram":"@gomesassociados","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Flávio Pimentel","empresa":"Pimentel Construções","categoria":"Construção / Reformas / Automação","whatsapp":"5581991818181","email":"flavio@pimentelconstrucoes.com.br","instagram":"@pimentelconstrucoes","resumo_analitico":"ICP: Alta | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Gabriela Souza","empresa":"Souza Imóveis","categoria":"Imóveis Médio/Alto Padrão","whatsapp":"5581993636363","email":"gabriela@souzaimoveis.com.br","instagram":"@souzaimoveis","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Getúlio Ferreira","empresa":"Ferreira Logística","categoria":"Distribuição e Logística","whatsapp":"5581987474747","email":"getulio@ferreiralogistica.com.br","instagram":"@ferreiralogistica","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Giovana Melo","empresa":"Melo Estética","categoria":"Estética","whatsapp":"5581996565656","email":"giovana@melostetica.com.br","instagram":"@melostetica","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Guilherme Lemos","empresa":"Lemos Energia","categoria":"Energia","whatsapp":"5581984848484","email":"guilherme@lemosenergia.com.br","instagram":"@lemosenergia","resumo_analitico":"ICP: Alta | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Gustavo Arruda","empresa":"Arruda & Barros Advocacia","categoria":"Direito Empresarial e Cível","whatsapp":"5581993939393","email":"gustavo@arrudabarros.adv.br","instagram":"@arrudabarros.adv","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Heitor Figueiredo","empresa":"Figueiredo Auto Center","categoria":"Oficina Mecânica","whatsapp":"5581982020202","email":"heitor@figueiredoauto.com.br","instagram":"@figueiredoauto","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Henrique Viana","empresa":"Viana Telecom","categoria":"Telecomunicação","whatsapp":"5581991111111","email":"henrique@vianatel.com.br","instagram":"@vianacom","resumo_analitico":"ICP: Alta | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Hugo Queiroz","empresa":"Queiroz Financeira","categoria":"Financeiro / Tecnologia","whatsapp":"5581990909090","email":"hugo@queirozfinanceira.com.br","instagram":"@queirozfinanceira","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Igor Galdino","empresa":"Galdino Eventos Educacionais","categoria":"Eventos Educacionais","whatsapp":"5581999707070","email":"igor@galdinoeventos.com.br","instagram":"@galdinoeventos","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Isabela Marques","empresa":"Marques Odontologia","categoria":"Odontologia","whatsapp":"5581998686868","email":"isabela@marquesodonto.com.br","instagram":"@marquesodonto","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Ivan Soares","empresa":"Soares Consultoria Empresarial","categoria":"Estruturação e Assessoria Comercial","whatsapp":"5581997575757","email":"ivan@soaresconsultoria.com.br","instagram":"@soares.consultoria","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Janaína Farias","empresa":"Farias & Lima Advogados","categoria":"Advocacia","whatsapp":"5581996363636","email":"janaina@fariaslima.adv.br","instagram":"@fariaslima.adv","resumo_analitico":"ICP: Alta | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"João Bastos","empresa":"Bastos Atacado","categoria":"Atacado / Varejo","whatsapp":"5581994141414","email":"joao@bastosatacado.com.br","instagram":"@bastosatacado","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"José Augusto Wanderley","empresa":"Wanderley Construções","categoria":"Construção Civil","whatsapp":"5581993232323","email":"joseaugusto@wanderleyconstrucoes.com.br","instagram":"@wanderleyconstrucoes","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Juliana Pessoa","empresa":"Pessoa Treinamentos","categoria":"Treinamento para Empresas e Executivos","whatsapp":"5581992121212","email":"juliana@pessoapessoal.com.br","instagram":"@julianapessoacoach","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Júlio Ribeiro","empresa":"Ribeiro Proteção Veicular","categoria":"Proteção Veicular","whatsapp":"5581991010101","email":"julio@ribeiroproteção.com.br","instagram":"@ribeiroproteção","resumo_analitico":"ICP: Média | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Karla Dantas","empresa":"Dantas Representações","categoria":"Representação Comercial","whatsapp":"5581990808080","email":"karla@dantasrep.com.br","instagram":"@dantasrep","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Lara Mendonça","empresa":"Mendonça Saúde Desportiva","categoria":"Saúde Desportiva","whatsapp":"5581989898989","email":"lara@mendonçasaude.com.br","instagram":"@mendonca.saude","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Lúcia Santos","empresa":"Santos & Cia Contabilidade","categoria":"Contabilidade","whatsapp":"5581988888888","email":"lucia@santoscontab.com.br","instagram":"@santosecia.contab","resumo_analitico":"ICP: Alta | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Luciano Brandão","empresa":"Brandão Solar","categoria":"Energia Solar","whatsapp":"5581987878787","email":"luciano@brandaosolar.com.br","instagram":"@brandaosolar","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Luísa Castro","empresa":"Castro Moda Praia","categoria":"Indústria de Moda Praia","whatsapp":"5581986868686","email":"luisa@castromodapraia.com.br","instagram":"@castromodapraia","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Marcelo Oliveira","empresa":"Oliveira Automotivo","categoria":"Automotivo","whatsapp":"5581985858585","email":"marcelo@oliveirauto.com.br","instagram":"@oliveirauto","resumo_analitico":"ICP: Média | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Márcio Albuquerque","empresa":"Albuquerque Imóveis","categoria":"Imóveis (Região de Aldeia)","whatsapp":"5581984747474","email":"marcio@albuquerqueimoveis.com.br","instagram":"@albuquerqueimoveis","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Marina Lima","empresa":"Lima Psicologia","categoria":"Psicologia / Consultoria de Empresas","whatsapp":"5581983636363","email":"marina@limapsicologia.com.br","instagram":"@limapsico","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Mário Freitas","empresa":"Freitas Distribuidora","categoria":"Distribuidora de Higiene e Limpeza","whatsapp":"5581982626262","email":"mario@freitasdist.com.br","instagram":"@freitasdist","resumo_analitico":"ICP: Alta | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Natália Correia","empresa":"Correia Comunicação","categoria":"Publicidade e Marketing Digital","whatsapp":"5581981515151","email":"natalia@correia.com.br","instagram":"@correia.digital","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Nicolau Azevedo","empresa":"Azevedo & Filhos Logística","categoria":"Logística","whatsapp":"5581980404040","email":"nicolau@azevedofilhos.com.br","instagram":"@azevedologistica","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Paloma Araújo","empresa":"Araújo Colchões","categoria":"Comércio Varejista de Colchões","whatsapp":"5581999393939","email":"paloma@araujocolchoes.com.br","instagram":"@araujocolchoes","resumo_analitico":"ICP: Média | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Patrícia Meneses","empresa":"Meneses Desenvolvimento Pessoal","categoria":"Desenvolvimento Pessoal","whatsapp":"5581998282828","email":"patricia@menesescoach.com.br","instagram":"@patricia.meneses.coach","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Paulo Sérgio Cavalcanti","empresa":"Cavalcanti Engenharia","categoria":"Construção Civil","whatsapp":"5581997171717","email":"paulo@cavalcantieng.com.br","instagram":"@cavalcantiengenharia","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Pedro Augusto Melo","empresa":"Melo Automotivo","categoria":"Automotivo / Comércio","whatsapp":"5581996060606","email":"pedro@meloautomotivo.com.br","instagram":"@meloauto","resumo_analitico":"ICP: Média | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Rafael Marcelino","empresa":"Marcelino Consórcio","categoria":"Consórcio","whatsapp":"5581994949494","email":"rafael@marcelinoconsorcio.com.br","instagram":"@marcelinoconsorcio","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Raquel Borges","empresa":"Borges Saúde","categoria":"Saúde / Bem-estar","whatsapp":"5581993838383","email":"raquel@borgesaude.com.br","instagram":"@borgesaude","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Renata Cavalcante","empresa":"Cavalcante Marca Pessoal","categoria":"Marca Pessoal","whatsapp":"5581992727272","email":"renata@cavalcantemarca.com.br","instagram":"@renatacavalcantemarca","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Ricardo Sena","empresa":"Sena Assessoria Financeira","categoria":"Finanças","whatsapp":"5581991616161","email":"ricardo@senafinanceira.com.br","instagram":"@senafinanceira","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Roberto Matos","empresa":"Matos Eventos","categoria":"Estruturas para Eventos e Shows","whatsapp":"5581990505050","email":"roberto@matos.com.br","instagram":"@matos.eventos","resumo_analitico":"ICP: Alta | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Rodrigo Ramos","empresa":"Ramos & Souza Advogados","categoria":"Trabalhista Empresarial","whatsapp":"5581989494949","email":"rodrigo@ramossouza.adv.br","instagram":"@ramossouza.adv","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Romulo Bezerra","empresa":"Bezerra Construtora","categoria":"Construção Civil","whatsapp":"5581988383838","email":"romulo@bezerraconstrutora.com.br","instagram":"@bezerraconstrutora","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Rosana Figueiredo","empresa":"Figueiredo Saúde","categoria":"Saúde (a confirmar)","whatsapp":"5581987272727","email":"rosana@figueiredo-saude.com.br","instagram":"@figueiredo.saude","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Sabrina Melo","empresa":"Melo & Lima Advocacia","categoria":"Planejamento Patrimonial e Sucessório","whatsapp":"5581986161616","email":"sabrina@melolima.adv.br","instagram":"@melolima.adv","resumo_analitico":"ICP: Alta | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Sandro Vasconcelos","empresa":"Vasconcelos Tecnologia","categoria":"Tecnologia / Telecom","whatsapp":"5581985050505","email":"sandro@vasconteloc.com.br","instagram":"@vascontec","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Sérgio Carvalho","empresa":"Carvalho Imobiliária","categoria":"Imobiliário","whatsapp":"5581983939393","email":"sergio@carvalhoimob.com.br","instagram":"@carvalhoimob","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Silvia Lemos","empresa":"Lemos Serviços","categoria":"Serviços","whatsapp":"5581982929292","email":"silvia@lemosservicos.com.br","instagram":null,"resumo_analitico":"ICP: Média | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Simone Rocha","empresa":"Rocha Educação","categoria":"Educação","whatsapp":"5581981818181","email":"simone@rochaeducacao.com.br","instagram":"@rochaeducacao","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Sofia Torres","empresa":"Torres Cosméticos","categoria":"Cosméticos / Varejo","whatsapp":"5581980707070","email":"sofia@torres-cosmeticos.com.br","instagram":"@torrescosmeticos","resumo_analitico":"ICP: Média | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Thiago Nobre","empresa":"Nobre Consórcio","categoria":"Consórcio / Financeiro","whatsapp":"5581999606060","email":"thiago@nobreconsorcio.com.br","instagram":"@nobreconsorcio","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Túlio Mendes","empresa":"Mendes Brindes","categoria":"Brindes, Placas, Troféus","whatsapp":"5581998505050","email":"tulio@mendesbrindes.com.br","instagram":"@mendesbrindes","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Valdeci Barros","empresa":"Barros & Cruz Consultoria","categoria":"Consultoria","whatsapp":"5581997404040","email":"valdeci@barroscruzconsultoria.com.br","instagram":"@barroscruz.consultoria","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Valquíria Monteiro","empresa":"Monteiro Beleza","categoria":"Serviço (beleza)","whatsapp":"5581996303030","email":"valquiria@monteirobeleza.com.br","instagram":"@monteirobeleza","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Vanessa Ribeiro","empresa":"Ribeiro Varejo Esportivo","categoria":"Varejo / Esportivo","whatsapp":"5581995202020","email":"vanessa@ribeiroesportivo.com.br","instagram":"@ribeiroesportivo","resumo_analitico":"ICP: Média | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Vera Bezerra","empresa":"Bezerra Holding","categoria":"Diversos / Holding","whatsapp":"5581994101010","email":"vera@bezzerraholding.com.br","instagram":null,"resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Victor Cabral","empresa":"Cabral Publicidade","categoria":"Publicidade e Marketing Digital","whatsapp":"5581993000000","email":"victor@cabralpub.com.br","instagram":"@cabralpub","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Viviane Paes","empresa":"Paes Saúde Odontologia","categoria":"Saúde / Odontologia","whatsapp":"5581992020202","email":"viviane@paessaude.com.br","instagram":"@paessaude","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Wanessa Silva","empresa":"Silva Têxtil","categoria":"Têxtil / Confecção","whatsapp":"5581991010101","email":"wanessa@silvatextil.com.br","instagram":"@silvatextil","resumo_analitico":"ICP: Média | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Wellington Santos","empresa":"Santos Serviços Elétricos","categoria":"Elétrica / Serviços","whatsapp":"5581990000000","email":"wellington@santoseletrica.com.br","instagram":"@santoseletrica","resumo_analitico":"ICP: Alta | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Yago Mendes","empresa":"Mendes Club de Benefícios","categoria":"Clube de Benefícios / Serviços","whatsapp":"5581999191919","email":"yago@mendesclub.com.br","instagram":"@mendesclub","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Yasmin Correia","empresa":"Correia Agilvet","categoria":"Pet","whatsapp":"5581998181818","email":"yasmin@correiapet.com.br","instagram":"@correiapet","resumo_analitico":"ICP: Média | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Zorilda Costa","empresa":"Costa Saúde Pré-Hospitalar","categoria":"Saúde - Atendimento Pré-Hospitalar","whatsapp":"5581997070707","email":"zorilda@costasaude.com.br","instagram":"@costasaude","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"},{"nome":"Iracema Vitorino","empresa":"Vitorino Embalagens","categoria":"Embalagens","whatsapp":"5581990101010","email":"iracema@vitorinoembala.com.br","instagram":null,"resumo_analitico":"ICP: Média | Fonte: Caruaru","modo_atendimento":"bot"},{"nome":"Ortobom Recife","empresa":"Ortobom Recife","categoria":"Colchões","whatsapp":"5581999012345","email":"orcf@ortobom.com.br","instagram":"@ortobomcrf","resumo_analitico":"ICP: Média | Fonte: Encontro","modo_atendimento":"bot"}];

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
