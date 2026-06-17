-- ============================================================
-- SETUP IntelliX Tenant — LeadFinder Pro
-- Gerado: 2026-06-17T19:21:42.571229Z
-- Execute no Supabase SQL Editor do projeto kzvnwqlcrtxwagxkghxq
-- ============================================================

-- ── 0. SCHEMA: adiciona colunas faltantes em user_settings ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='provider') THEN
    ALTER TABLE public.user_settings ADD COLUMN provider TEXT DEFAULT 'evolution';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='business_phone_number_id') THEN
    ALTER TABLE public.user_settings ADD COLUMN business_phone_number_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='business_access_token') THEN
    ALTER TABLE public.user_settings ADD COLUMN business_access_token TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='meta_verify_token') THEN
    ALTER TABLE public.user_settings ADD COLUMN meta_verify_token TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='consultant_whatsapp') THEN
    ALTER TABLE public.user_settings ADD COLUMN consultant_whatsapp TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='agent_enabled') THEN
    ALTER TABLE public.user_settings ADD COLUMN agent_enabled BOOLEAN DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='openai_api_key') THEN
    ALTER TABLE public.user_settings ADD COLUMN openai_api_key TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='integration_configured') THEN
    ALTER TABLE public.user_settings ADD COLUMN integration_configured BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='pending_setup') THEN
    ALTER TABLE public.user_settings ADD COLUMN pending_setup BOOLEAN DEFAULT true;
  END IF;
END $$;

ALTER TABLE public.leads_prospeccao ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE public.leads_prospeccao ADD COLUMN IF NOT EXISTS origem TEXT;
ALTER TABLE public.leads_prospeccao ADD COLUMN IF NOT EXISTS modo_atendimento TEXT DEFAULT 'bot';
ALTER TABLE public.leads_prospeccao ADD COLUMN IF NOT EXISTS mensagem_personalizada TEXT;
ALTER TABLE public.leads_prospeccao ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.leads_prospeccao ADD COLUMN IF NOT EXISTS data_ultima_interacao TIMESTAMPTZ;
ALTER TABLE public.leads_prospeccao ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0;

-- ── T1a. Criar usuário auth (se não existir) ────────────────────────────────
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  gen_random_uuid(),
  'authenticated', 'authenticated',
  'contato@intellixai.com.br',
  crypt('Admin@123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(),
  '', '', '', ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'contato@intellixai.com.br'
);

-- ── T1b. Upsert user_settings ───────────────────────────────────────────────
INSERT INTO public.user_settings (
  user_id, company_name, role,
  provider, consultant_whatsapp,
  integration_configured, pending_setup,
  agent_enabled, created_at, updated_at
)
SELECT
  u.id, 'IntelliX.AI', 'admin',
  'meta', '5581988514775',
  true, false,
  true, now(), now()
FROM auth.users u
WHERE u.email = 'contato@intellixai.com.br'
ON CONFLICT (user_id) DO UPDATE SET
  company_name        = EXCLUDED.company_name,
  role                = 'admin'::user_role,
  provider            = EXCLUDED.provider,
  consultant_whatsapp = EXCLUDED.consultant_whatsapp,
  integration_configured = true,
  pending_setup          = false,
  agent_enabled          = true,
  updated_at             = now();

-- ── T5. Agent config — Bia v1 ───────────────────────────────────────────────
-- Primeiro, desativa configs anteriores do tenant IntelliX
UPDATE public.agent_configs
SET is_active = false
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'contato@intellixai.com.br')
  AND is_active = true;

INSERT INTO public.agent_configs (
  id, user_id, name, system_prompt, prompt_version,
  model, temperature, max_iterations, is_active,
  created_at, updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  'IntelliX SDR — Bia v1',
  '# Identidade

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
8. Nunca pressione. "Não agora" é resposta válida: agradeça e encerre com gentileza.',
  'custom',
  'gpt-4.1',
  0.60,
  5,
  true,
  now(), now()
FROM auth.users u
WHERE u.email = 'contato@intellixai.com.br'
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_configs
    WHERE user_id = u.id AND name = 'IntelliX SDR — Bia v1'
  );

-- ── T4. Importar 111 leads — IntelliX Campanha Encontro & Relacionamento ────
-- Idempotente: ignora leads com mesmo whatsapp + tenant_id já existentes
DO $$
DECLARE v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'contato@intellixai.com.br';
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário contato@intellixai.com.br não encontrado em auth.users';
  END IF;

  -- Lead 1: Recife Caixas Indústria de Embalagens
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'a778ddc1-6c25-4d13-ba45-c92c60d15d21', 'Ademilson da Silva Fonseca', 'Recife Caixas Indústria de Embalagens', 'Indústria de Papelão', '5581984250782',
    'fonseca.sudperbambuco@gmail.com', '@fonsecajornadadoempreendedor',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Recife Caixas Indústria de Embalagens'
      AND user_id = v_user_id
  );

  -- Lead 2: Grupo Rede
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'a3508677-6da1-4fa4-9860-8931e6cd6766', 'Admilson F Queiroz Junior', 'Grupo Rede', 'Contabilidade / Serviços', '5581995162299',
    'juninhowqueiroz@hotmail.com', NULL,
    'ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Adriano Fernando dos Santos (81 9 9248-5894), Rayanne Moura (81 9 9898-2565), Tiago Costa Moura (81 9 9459-0340)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Grupo Rede'
      AND user_id = v_user_id
  );

  -- Lead 3: Engtec Engenharia e Manutenção
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'e2d1cca5-4e8f-445c-bb9f-fe3f921e18fd', 'Adriana dos Anjos Brito', 'Engtec Engenharia e Manutenção', 'Refrigeração e Climatização', '5581996641330',
    'adriana.brito@engtecmanutencao.com', '@engtecmanutencao',
    'ICP: Média | Fonte: Caruaru + Encontro | Outros contatos deste lead: Ícaro Estêvão de Oliveira Costa (81 9 9998-1558), Adriana dos Anjos Brito (81 9 9664-1330), Ícaro Estêvão de Oliveira Costa (81 9 9998-1558), Rildo Cavalcanti da Silva (81 9 9801-6000)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Engtec Engenharia e Manutenção'
      AND user_id = v_user_id
  );

  -- Lead 4: Criare / Italinea - Móveis Planejados
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '2c4e92b5-f76b-4769-9e2b-e18784874435', 'Adriano Negrini Costa Manso', 'Criare / Italinea - Móveis Planejados', 'Móveis Planejados (alto padrão)', '5581991123801',
    'adriano@confianceplanejados.com.br', '@negriniadrianocm',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Criare / Italinea - Móveis Planejados'
      AND user_id = v_user_id
  );

  -- Lead 5: Cavendish Consultoria / Incorporadora Be Your Home
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '8e6a7b1c-fc55-40b0-9f42-e450819a0a2a', 'Alberto José da Costa Lima Cavendish Moreira', 'Cavendish Consultoria / Incorporadora Be Your Home', 'Incorporação e consultoria empresarial', '5581988763085',
    'contato@grupocavendish.com.br', '@grupocavendish',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Cavendish Consultoria / Incorporadora Be Your Home'
      AND user_id = v_user_id
  );

  -- Lead 6: MD Vendas - Investimentos Imobiliários
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'b07be6b5-6548-4316-95f3-2ba8378e4aab', 'Alexandre Borba Gurgel Do Amaral', 'MD Vendas - Investimentos Imobiliários', 'Imóveis', '5581981878788',
    'alexandre.gurgel@mdvendas.com.br', '@alexandregurguel78',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'MD Vendas - Investimentos Imobiliários'
      AND user_id = v_user_id
  );

  -- Lead 7: Agência Ágil
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '965ee23a-ab92-41ba-a2f6-beed3f4759cc', 'Alexandre de Oliveira Siqueira', 'Agência Ágil', 'Tráfego pago', '5581996421010',
    'alexandre.agilmkt@gmail.com', '@alexandresiqueiraconsult',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Agência Ágil'
      AND user_id = v_user_id
  );

  -- Lead 8: Recsun Energia Solar
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'b80147e3-d37b-4e02-8b10-06c20e9b9d12', 'Alexandre Santos', 'Recsun Energia Solar', 'Energia Solar', '5581999940127',
    'alexandresantos@recsunenergia.com', NULL,
    'ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Suzanna Dias (81 9 9994-0211)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Recsun Energia Solar'
      AND user_id = v_user_id
  );

  -- Lead 9: Smarthec Náutica
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '5d381823-67be-40ad-8b4f-567ca756b2c0', 'Alexandre Tavares', 'Smarthec Náutica', 'Náutica (estaleiros, embarcações, iates)', '5581987911583',
    'alexandre@smarthec.com.br', '@smarthecnautica',
    'ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Patrícia Wanessa Nunes Aires Tavares (81 9 8791-1585)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Smarthec Náutica'
      AND user_id = v_user_id
  );

  -- Lead 10: AF Consultoria Empresarial & Coaching
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '07ac2b2f-ba93-40ec-9ad4-99d43577d881', 'Alexssandro Farias de Barros', 'AF Consultoria Empresarial & Coaching', 'Consultoria', NULL,
    'alexssandro_pe@hotmail.com', NULL,
    'ICP: Alta | Fonte: Caruaru | Número fora do padrão — conferir', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'humano', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'AF Consultoria Empresarial & Coaching'
      AND user_id = v_user_id
  );

  -- Lead 11: Agência Ozan
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'f6b72f53-49ff-42a1-adb2-6dab3889d027', 'Aline Crescêncio Pedrosa', 'Agência Ozan', 'Marketing', '5581982500162',
    'alinecrescencio2008@hotmail.com', '@line_pedrosa',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Agência Ozan'
      AND user_id = v_user_id
  );

  -- Lead 12: Lima e Maia Sociedade de Advogados
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '27a7513f-296c-4bc3-bf80-df5d42df7e4a', 'Aline Ramos Lima de Godoy', 'Lima e Maia Sociedade de Advogados', 'Planejamento Patrimonial e Sucessório', '5581999689999',
    'aline@limaemaia.adv.br', '@limaemaia.adv',
    'ICP: Média | Fonte: Encontro | Outros contatos deste lead: Kyara Amorim Maia Thorpe (81 9 9696-0710)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Lima e Maia Sociedade de Advogados'
      AND user_id = v_user_id
  );

  -- Lead 13: Brasil Gourmet
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '53fd3240-0aac-42fa-9820-ff2451a0d527', 'Álvaro Fonseca Da Silva', 'Brasil Gourmet', 'Supermercados, Atacado e Distribuição', '5583999443375',
    'brasilgourmetadm@hotmail.com', '@brasilgourmetalimentos',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Brasil Gourmet'
      AND user_id = v_user_id
  );

  -- Lead 14: 232 Burguer / Terraço da Praça
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '77369ff9-109f-481a-8232-4e62632af76f', 'Ana Luíza de Oliveira Lima França', '232 Burguer / Terraço da Praça', 'Restaurantes', '5581997311968',
    'analuizaolf@gmail.com', '@232burguer',
    'ICP: Média | Fonte: Caruaru + Encontro | Outros contatos deste lead: José Diego Nemesio Beltrão (81 9 9666-1154), Ana Luíza de Oliveira Lima França (81 9 9731-1968), José Diego Nemesio Beltrão (81 9 9666-1154)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE '232 Burguer / Terraço da Praça'
      AND user_id = v_user_id
  );

  -- Lead 15: Estruturar Consultoria
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'c5c1b31d-f793-4458-8848-061e9029ecd2', 'Ana Maria Rodrigues da Silva', 'Estruturar Consultoria', 'Consultoria em Estrutura Organizacional', '5581999108980',
    'estruturarconsultoria@gmail.com', '@anarodriguesconsultora',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Estruturar Consultoria'
      AND user_id = v_user_id
  );

  -- Lead 16: Agência Valore
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'e2ac8def-b2e7-4608-83a1-befa01658182', 'Anderson Candido Alves', 'Agência Valore', 'Marketing / Comunicação', '5581973139693',
    'anderson@agenciavalore.com.br', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Agência Valore'
      AND user_id = v_user_id
  );

  -- Lead 17: Guaray Pirotecnia
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '55b56cdf-8204-454f-88f7-650156cd2dda', 'Anderson De Oliveira Lacerda', 'Guaray Pirotecnia', 'Fogos de Artifício', '5581997471087',
    'anderson@guaraypirotecnia.com.br', '@guaray.pirotecnia',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Guaray Pirotecnia'
      AND user_id = v_user_id
  );

  -- Lead 18: Kabyte
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '58680c92-9543-41e7-a081-b84e3f1c6a19', 'Anderson Lourenço Barbosa da Silva', 'Kabyte', 'Suporte de TI com Cibersegurança', '5581996388485',
    'anderson@kabyte.com.br', '@kabyte',
    'ICP: Alta | Fonte: Caruaru + Encontro | Outros contatos deste lead: Anderson Lourenço Barbosa da Silva (81 9 9638-8485)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Kabyte'
      AND user_id = v_user_id
  );

  -- Lead 19: Arya
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'bddc5399-413b-40c1-a02c-523c05b11dde', 'Andréa Brito', 'Arya', 'Harmonização Orofacial', '5551991759133',
    'doutora.andreabrito@hotmail.com', '@dra.andreabrito',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Arya'
      AND user_id = v_user_id
  );

  -- Lead 20: Studio de Beleza / Podcast
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'd98755fb-1b73-4dbf-9063-9b649985e447', 'Ângela Maria da Costa Dantas', 'Studio de Beleza / Podcast', 'Estética / Mídia', '5581994318161',
    'contatoangeladantas@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Studio de Beleza / Podcast'
      AND user_id = v_user_id
  );

  -- Lead 21: Instrutora de Trânsito (autônoma)
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'ad8d2fda-b587-4205-b307-2c4d8ecc6c6f', 'Aparecida Ferreira da Silva', 'Instrutora de Trânsito (autônoma)', 'Educação / Serviços', '5581989667472',
    'aparecida.aquiles84@gmail.com', NULL,
    'ICP: Baixa | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Instrutora de Trânsito (autônoma)'
      AND user_id = v_user_id
  );

  -- Lead 22: APS Tecnologia
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '4bd6a01a-7c19-4110-9c2c-908b29eb32c3', 'Bernardino Francisco Borba Fernandes', 'APS Tecnologia', 'Tecnologia / TI', '5581997801192',
    'berna21@gmail.com', NULL,
    'ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Tiago Henrique Montezuma Belo (81 9 9755-0359)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'APS Tecnologia'
      AND user_id = v_user_id
  );

  -- Lead 23: Autônoma - Corretora de Imóveis
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'c0752b2d-b774-4bd6-b44a-5821efb0a531', 'Brenda de Freiras Janeiro Duran', 'Autônoma - Corretora de Imóveis', 'Imóveis de Médio a Alto Padrão', '5581999968288',
    'brendajduran@hotmail.com', '@tenhoseuimovel',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Autônoma - Corretora de Imóveis'
      AND user_id = v_user_id
  );

  -- Lead 24: TR Engenharia Incorporadora
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '43d4815b-ec6c-4b20-a8a8-eb3d6eb2da61', 'Breno de Morais Tompson Chateaubriand', 'TR Engenharia Incorporadora', 'Construção Civil', '5581999655556',
    'brenomtc@hotmail.com', '@tr_engenharia_',
    'ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Tiago Henrique Monteiro Rocha (81 9 9791-4875)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'TR Engenharia Incorporadora'
      AND user_id = v_user_id
  );

  -- Lead 25: Camilla Santana Advocacia
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '957e5d56-b778-4976-8ad3-000f5dfaf526', 'Camilla Santana', 'Camilla Santana Advocacia', 'Trabalhista Empresarial', '5581996054626',
    'camillasantanaadv@gmail.com', '@camillasantanado',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Camilla Santana Advocacia'
      AND user_id = v_user_id
  );

  -- Lead 26: Comunicação Estratégica e Oratória
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'd573a541-f1ee-406f-b5d6-183a529dbb11', 'Carla Andrea Bacelar Ramos', 'Comunicação Estratégica e Oratória', 'Treinamento para Empresas e Executivos', '5581991146020',
    'carlaandreabr@hotmail.com', '@carlabacelarr',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Comunicação Estratégica e Oratória'
      AND user_id = v_user_id
  );

  -- Lead 27: Kmoveis Móveis
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '411399c8-0150-4e9a-919a-7364d0f2e085', 'Carlos José Melo de França', 'Kmoveis Móveis', 'Móveis Corporativo e Residencial', '5581996893409',
    'kmoveissobmedidape@gmail.com', NULL,
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Kmoveis Móveis'
      AND user_id = v_user_id
  );

  -- Lead 28: Grupo Ferraz
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'ca5b3bfc-0d98-4124-90e7-455a63088cd7', 'Carlos Rodrigo Ferraz Silvestre', 'Grupo Ferraz', 'Diversos / Holding', '5587999544591',
    'rodrigoferraz40@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Grupo Ferraz'
      AND user_id = v_user_id
  );

  -- Lead 29: Datamotion / Traderxplosion
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '3b84521b-f6b6-4086-b726-643f9a525234', 'Cleyton Douglas Vieira Da Silva', 'Datamotion / Traderxplosion', 'Financeiro / Tecnologia', '5581999102754',
    'cleytond70@gmail.com', NULL,
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Datamotion / Traderxplosion'
      AND user_id = v_user_id
  );

  -- Lead 30: Kless Planejados
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'b8388893-a62a-4b24-a9f0-6b1bd02c50f9', 'Cris Silva', 'Kless Planejados', 'Móveis Planejados', '5511965290048',
    'nilssoncfferreira@gmail.com', NULL,
    'ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Nilsson Costa (sem tel)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Kless Planejados'
      AND user_id = v_user_id
  );

  -- Lead 31: Execute Consórcio Ltda
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'c0c94135-7757-4e2e-8b57-0b7670324843', 'Débora Karla Rodrigues Seabra', 'Execute Consórcio Ltda', 'Consórcio / Financeiro', '5581994109558',
    'executeconsorcio@gmail.com', NULL,
    'ICP: Alta | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Execute Consórcio Ltda'
      AND user_id = v_user_id
  );

  -- Lead 32: Freiria Corretora de Seguros
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '0b6489cf-c1f4-49b7-9b64-5bd3b3ec87ad', 'Denise Freiria', 'Freiria Corretora de Seguros', 'Seguros', '5581998146001',
    'freiria.denise@gmail.com', '@freiriacorretora',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Freiria Corretora de Seguros'
      AND user_id = v_user_id
  );

  -- Lead 33: Dinara Murta (marca pessoal)
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '3999443d-1660-464d-9fd4-f18512c16c71', 'Dinara Murta', 'Dinara Murta (marca pessoal)', 'Marca Pessoal', '5581994322064',
    'dinaramurta37@gmail.com', '@dinaramurta',
    'ICP: Baixa | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Dinara Murta (marca pessoal)'
      AND user_id = v_user_id
  );

  -- Lead 34: ACIC - Associação Comercial e Empresarial
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '41d70e83-2186-4d15-8081-152145ec7d16', 'Ed Eky Pires Dantas', 'ACIC - Associação Comercial e Empresarial', 'Associação Comercial', '5581994519628',
    'direcexec@aciccaruaru.com.br', NULL,
    'ICP: Baixa | Fonte: Caruaru | Outros contatos deste lead: Geraldo Pinheiro da Silva Junior (81 9 9128-1117), Maria Jullyana Alves de Lima (81 9 9133-4146)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'ACIC - Associação Comercial e Empresarial'
      AND user_id = v_user_id
  );

  -- Lead 35: Nina Baby
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '20276eea-bd1a-4e22-996f-da19c96d6cb8', 'Edcarlos Lucena', 'Nina Baby', 'Varejo / Comércio', '5575992362810',
    'ninababybags@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Nina Baby'
      AND user_id = v_user_id
  );

  -- Lead 36: Nossa Associados e Clube de Benefícios
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'bd237a84-5270-4ba9-be80-65788d134cf5', 'Edcarlos Pereira dos Santos', 'Nossa Associados e Clube de Benefícios', 'Clube de Benefícios / Serviços', '5587996343239',
    'edcarlos.pereira@hotmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Nossa Associados e Clube de Benefícios'
      AND user_id = v_user_id
  );

  -- Lead 37: Plaza Colchões / Franqueada Ortobom
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '1a93fa24-56e6-4985-a732-10b2bffe0f2d', 'Edilma Queiroz', 'Plaza Colchões / Franqueada Ortobom', 'Colchões', '5581999859627',
    'edilmaqueiroz1@hotmail.com', '@ortobomshoppingplaza',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Plaza Colchões / Franqueada Ortobom'
      AND user_id = v_user_id
  );

  -- Lead 38: Lia Cosméticos
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '7c4a63a1-8a16-4b58-b9df-665da7660754', 'Eliane Maria Januário Teixeira', 'Lia Cosméticos', 'Cosméticos / Varejo', '5581989447117',
    '—', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Lia Cosméticos'
      AND user_id = v_user_id
  );

  -- Lead 39: Clínica Odontobem
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'eb03de61-3108-4f1b-8a5f-27519ddeb8c2', 'Elida Maria de Arruda e Souza', 'Clínica Odontobem', 'Saúde / Odontologia', '5581997090173',
    'elida.arruda18@gmail.com', NULL,
    'ICP: Alta | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Clínica Odontobem'
      AND user_id = v_user_id
  );

  -- Lead 40: EJW
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'ec234718-ed62-4314-b09a-236d71fd4708', 'Émerson Silva Cavalcanti', 'EJW', 'Proteção Veicular', '5581996630103',
    'oboegoverno@gmail.com', '@emersoncavalcantiofc',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'EJW'
      AND user_id = v_user_id
  );

  -- Lead 41: Agência Moratori
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '580b4b00-726f-4938-8e16-603f28d131dd', 'Emily Carvalho', 'Agência Moratori', 'Marketing / Comunicação', '5581982075112',
    'emilycarvalhomkt@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Agência Moratori'
      AND user_id = v_user_id
  );

  -- Lead 42: FC Atacadista
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '91015df1-02ba-43b2-8853-54e419f3e17c', 'Fatima Cristina Freire de Lucena', 'FC Atacadista', 'Distribuidora de Higiene e Limpeza', '5581998506604',
    'nrfatimalucena1@hotmail.com', '@Fcatacadistaa',
    'ICP: Alta | Fonte: Caruaru + Encontro | Outros contatos deste lead: Maria Amélia Dias da Mota (81 9 9626-7514), Drianny Santos de Andrade Polari da Silva (81 9 9223-5431), Ericka Priscilla da Silva Dourado Barros (81 9 8614-6315), Priscilla Ursula Brito Barbosa (81 9 9661-2841), Ubirajara Faustino de Oliveira Junior (81 9 9911-4601)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'FC Atacadista'
      AND user_id = v_user_id
  );

  -- Lead 43: FRC Lima
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '01fddd17-c0b9-482a-83e6-a504e300b856', 'Fernando Roberto Cruz Correia Lima', 'FRC Lima', 'Distribuição e Logística', '5581981405903',
    'fernandolima17@hotmail.com', '@amrdistribuidora',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'FRC Lima'
      AND user_id = v_user_id
  );

  -- Lead 44: Lideri Telecom
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'e7cbc38d-d972-4e9e-9ec2-d7540181da3d', 'Franklin Ferreira', 'Lideri Telecom', 'Tecnologia / Telecom', '5581982122660',
    'franklin@lideri.com.br', '@lideritelecom',
    'ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Icaro Roberto dos Santos Carlos (81 9 9404-5660)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Lideri Telecom'
      AND user_id = v_user_id
  );

  -- Lead 45: Urben Lemos Engenharia / Homebot Automação
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '382fc9b0-fde8-4149-b42b-202da196e587', 'Gabriel Urben Silvestre', 'Urben Lemos Engenharia / Homebot Automação', 'Construção / Reformas / Automação', '5581997024442',
    'gabrielurben@gmail.com', NULL,
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Urben Lemos Engenharia / Homebot Automação'
      AND user_id = v_user_id
  );

  -- Lead 46: Albuquerque Advocacia (ALBQ)
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '2056dec6-f5d9-4e77-a8f6-450c988aeae5', 'Gabriel Vieira Chaves', 'Albuquerque Advocacia (ALBQ)', 'Jurídico Cível', '5581992214448',
    'gabrielvieira@albq.adv.br', '@albqadvocacia',
    'ICP: Alta | Fonte: Caruaru + Encontro | Outros contatos deste lead: Guilherme Parízio Guimarães (81 9 8186-5797), Raissa Maria de Albertim Mattos (81 9 9750-1717), Gabriel Vieira Chaves (81 9 9221-4448)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Albuquerque Advocacia (ALBQ)'
      AND user_id = v_user_id
  );

  -- Lead 47: Opportunity Gestão & Negócios
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'bd0c6f2a-d9af-455a-ba8d-66fe8f606639', 'Geovana Cristina Pereira Lopes', 'Opportunity Gestão & Negócios', 'Finanças', '5511910309550',
    'geocplopes@icloud.com', '@eusougeovanalopes',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Opportunity Gestão & Negócios'
      AND user_id = v_user_id
  );

  -- Lead 48: GT Automotive
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'be41d08b-377b-40e7-86ab-d5869f7a110d', 'Glauber Alexandre Freire Martins', 'GT Automotive', 'Automotivo', '5581996370544',
    'g.martins0022@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru | Outros contatos deste lead: Tiago Fontes Martins (81 9 9672-1246)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'GT Automotive'
      AND user_id = v_user_id
  );

  -- Lead 49: G V Da Silva Colchoaria
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '63407c47-45ae-47b7-a126-a0213f094eb3', 'Gleice Valéria Da Silva', 'G V Da Silva Colchoaria', 'Comércio Varejista de Colchões', '5581997204390',
    'universodoscolchoes2019@gmail.com', '@universodoscolchoes_',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'G V Da Silva Colchoaria'
      AND user_id = v_user_id
  );

  -- Lead 50: Proslab Laboratório Clínico
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '158f4db9-18a7-4fa1-88dd-fbf7ef052eee', 'Gleycilayne Millena Georgia Silva Sales', 'Proslab Laboratório Clínico', 'Saúde / Laboratório', '5581993751448',
    'g.sales@live.com', NULL,
    'ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Weider Gleybson de Souza (81 9 9940-4145)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Proslab Laboratório Clínico'
      AND user_id = v_user_id
  );

  -- Lead 51: GM Agência - Publicidade e Gestão Artística
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '62b1b1f0-0d01-4ef0-b85d-06571c015cd6', 'Guilherme Marinho Feitosa', 'GM Agência - Publicidade e Gestão Artística', 'Publicidade e Marketing Digital', '5594991015550',
    'gmarinhofeitosa@gmail.com', '@gmagecias',
    'ICP: Média | Fonte: Encontro | Outros contatos deste lead: Kayky Leão (82 9 9804-3259)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'GM Agência - Publicidade e Gestão Artística'
      AND user_id = v_user_id
  );

  -- Lead 52: GWS Comunicação
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '7d0aed94-d9c7-4b23-9c66-43814731d4a7', 'Gustavo Candido dos Santos', 'GWS Comunicação', 'Marketing / Comunicação', '5581997305848',
    'gustavo.santos@gwscomunicacao.com', NULL,
    'ICP: Média | Fonte: Caruaru | Outros contatos deste lead: Maria Eduarda Pereira do Monte (81 9 9730-5848)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'GWS Comunicação'
      AND user_id = v_user_id
  );

  -- Lead 53: abtPet - Assoc. Bras. dos Tutores de Pet
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '8b1773fb-6986-45fc-8a3d-bcba51e1629e', 'Gustavo Mendonça', 'abtPet - Assoc. Bras. dos Tutores de Pet', 'Pet', '5581988077890',
    'gustavo.mendonca@abtpet.org.br', '@abtpet',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'abtPet - Assoc. Bras. dos Tutores de Pet'
      AND user_id = v_user_id
  );

  -- Lead 54: DExpress Log
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'd1b894a4-900d-4e70-94d5-98841d3e07cf', 'Heitor Guilherme Matias Almeida', 'DExpress Log', 'Logística', '5581996359829',
    'heitormatias1506@outlook.com', NULL,
    'ICP: Alta | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'DExpress Log'
      AND user_id = v_user_id
  );

  -- Lead 55: Nattú Engenharia
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '67ecd3ab-e7fc-4ba2-b2be-f9e46ac9fe9a', 'Hugo Leon Abreu de Santana', 'Nattú Engenharia', 'Negócios Imobiliários', '5581999098440',
    'hugoleon.arq@gmail.com', '@nattueng',
    'ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Mateus Xavier de Alcântara Neres (81 9 9277-0004)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Nattú Engenharia'
      AND user_id = v_user_id
  );

  -- Lead 56: Kaya Advisory
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '37c9035c-aaf8-4b8d-a5a0-72d2f74112ad', 'Igor Alves de Miranda', 'Kaya Advisory', 'Consultoria Financeira', '5581995088706',
    'igormiranda@advisory360.com.br', '@kayaadvisory360',
    'ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Renata Suellen Fernandes (81 9 8101-3615)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Kaya Advisory'
      AND user_id = v_user_id
  );

  -- Lead 57: Construção Celular / Projehub / Capricho Engenharia
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '7fa27d35-5dda-468c-bc2b-faf2dd804c67', 'Ilregel Alves Semann Filho', 'Construção Celular / Projehub / Capricho Engenharia', 'Construção Civil', '5581988032551',
    'ilregel@gmail.com', NULL,
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Construção Celular / Projehub / Capricho Engenharia'
      AND user_id = v_user_id
  );

  -- Lead 58: Corretora Franqueada Prudential
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '783bcd37-2359-4b6a-ac06-c8d6455f5cb1', 'Irandê Poran Alves Matias', 'Corretora Franqueada Prudential', 'Seguros', '5581992882917',
    'irande.matias@prudentialfranquia.com', NULL,
    'ICP: Alta | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Corretora Franqueada Prudential'
      AND user_id = v_user_id
  );

  -- Lead 59: Super Estela
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '69c9a278-07c6-42f2-8730-f783761a0a92', 'Iranise Farias Gomes', 'Super Estela', 'Alimentício', '5581981298425',
    'superestrelaweb@gmail.com', '@Super.estrelaa',
    'ICP: Média | Fonte: Encontro | Outros contatos deste lead: Mateus Joaquim Farias Gomes (81 9 9719-9443)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Super Estela'
      AND user_id = v_user_id
  );

  -- Lead 60: Wanserver
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'ae8d36ef-b5fb-4c48-92af-1d1d89f83ded', 'Ivanildo Marcelino da Silva', 'Wanserver', 'Tecnologia / TI', '5581996181644',
    'marcelino@wanserver.com.br', NULL,
    'ICP: Alta | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Wanserver'
      AND user_id = v_user_id
  );

  -- Lead 61: Adez Saúde Desportiva
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '764c77dd-56b5-4073-b8ff-3163ed59e2d5', 'Jeniffer Iriani Barbosa da Silva', 'Adez Saúde Desportiva', 'Saúde Desportiva', '5581998925863',
    'iriani.jenyffer@gmail.com', '@adezsaudedesportiva',
    'ICP: Média | Fonte: Encontro | Outros contatos deste lead: Paulo Roberto Marques Garcia (81 9 9717-7467)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Adez Saúde Desportiva'
      AND user_id = v_user_id
  );

  -- Lead 62: CTI Imobiliária
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '90c0c844-98a3-4945-810a-3e6a2acd33e4', 'João Cláudio da Trindade Meira Henriques', 'CTI Imobiliária', 'Imóveis Médio/Alto Padrão', '5581991444983',
    'joaoclaudiot@hotmail.com', '@joaoclaudio_imoveis',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'CTI Imobiliária'
      AND user_id = v_user_id
  );

  -- Lead 63: Lojão dos Varais
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '0adc8311-db1c-4952-a834-036516c3b17f', 'João D Azevedo e Silva Neto', 'Lojão dos Varais', 'Fabricação e Venda de Varais', '5581999883038',
    'joaodazevedo@icloud.com', '@dazevedojoao',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Lojão dos Varais'
      AND user_id = v_user_id
  );

  -- Lead 64: Diamante Rodas
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '2da2997a-4822-4b9f-83b4-59dfba4ee7f1', 'João Saulo Soares de Macedo', 'Diamante Rodas', 'Automotivo / Comércio', '5581992340549',
    'financeiro@diamanterodas.com.br', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Diamante Rodas'
      AND user_id = v_user_id
  );

  -- Lead 65: Santana Eletricidade
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '7149d523-7e61-4602-9bfc-dd339dab595f', 'João Victor Malagueta Santana', 'Santana Eletricidade', 'Elétrica / Serviços', '5581992957056',
    'joaovictor20231234@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Santana Eletricidade'
      AND user_id = v_user_id
  );

  -- Lead 66: Moura Dubeux
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'feb66bdd-f8f7-4dca-841c-3540ff254273', 'Jonas Andrade', 'Moura Dubeux', 'Construtora / Incorporação', '5581999738118',
    'jonas.andrade@mdvendas.com.br', '@jonasandrade',
    'ICP: Alta | Fonte: Caruaru + Encontro | Outros contatos deste lead: Eduardo Trajano (81 9 9201-6980), Jonas Andrade (81 9 9973-8118)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Moura Dubeux'
      AND user_id = v_user_id
  );

  -- Lead 67: Tv Vida Fantástica
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'dae6595a-84c2-472d-8e14-08dd3150d179', 'Jonas Cristiano Gomes Bezerra', 'Tv Vida Fantástica', 'Mídia / Comunicação', '5581998869588',
    'jonascaruaru@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Tv Vida Fantástica'
      AND user_id = v_user_id
  );

  -- Lead 68: Grupo Jonatas Oliveira
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'adae328c-4c22-4861-83c2-9abdec36ed04', 'Jônatas Alves de Oliveira', 'Grupo Jonatas Oliveira', 'Setor Público', '5583991375335',
    'jonatas.diretoria@gmail.com', '@o.jonatasoliveira_',
    'ICP: Baixa | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Grupo Jonatas Oliveira'
      AND user_id = v_user_id
  );

  -- Lead 69: Xavier Representações
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '7de4ac48-4e2b-415d-bb73-13b6b0e33e4c', 'Jorge Francisco Xavier', 'Xavier Representações', 'Representação Comercial', '5581986817758',
    'jxavier.vendas@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Xavier Representações'
      AND user_id = v_user_id
  );

  -- Lead 70: Business Club
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '5c105513-ab46-4be5-8f03-468d7d5e1ccd', 'José Hélio da Silva Júnior', 'Business Club', 'Eventos Educacionais', '5581982533372',
    'heliosilva.jr28@gmail.com', '@businessclub_vsa',
    'ICP: Média | Fonte: Caruaru + Encontro | Outros contatos deste lead: José Hélio da Silva Júnior (81 9 8253-3372)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Business Club'
      AND user_id = v_user_id
  );

  -- Lead 71: Energy Brasil Agreste
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '7c595695-d427-4193-8426-90d5ec07c8f8', 'José Ialison Bezerra da Silva', 'Energy Brasil Agreste', 'Energia', '5581982736485',
    'ialisonbrow@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Energy Brasil Agreste'
      AND user_id = v_user_id
  );

  -- Lead 72: Agilvet - Farmácia Veterinária
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '127cbcc9-a3d5-4712-9a58-10943f359178', 'José Joelson Pereira', 'Agilvet - Farmácia Veterinária', 'Pet / Veterinária', '5581981563939',
    'joelsonpereira.jp1@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Agilvet - Farmácia Veterinária'
      AND user_id = v_user_id
  );

  -- Lead 73: Grupo Rivas
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '12001003-3bb1-4782-bcc6-3cfb3296604e', 'José Rivaldo Alves da Silva', 'Grupo Rivas', 'Diversos / Holding', '5581993994530',
    '—', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Grupo Rivas'
      AND user_id = v_user_id
  );

  -- Lead 74: Vitalitè Clínica Orofacial
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '9a0abfa9-b58f-47b1-910c-3f6c630c3ac2', 'José Rodrigo Barbosa Franklin', 'Vitalitè Clínica Orofacial', 'Odontologia', '5581995443731',
    'rodrigoblx@hotmail.com', '@rodrigofbarbosa',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Vitalitè Clínica Orofacial'
      AND user_id = v_user_id
  );

  -- Lead 75: Malha & Cia
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'f30cde23-ed73-48eb-98d5-4b55c921bbb3', 'José Uchoa Neto', 'Malha & Cia', 'Têxtil / Confecção', '5587996263253',
    'marikessiau@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru | Outros contatos deste lead: Maria Kessia Leônidas de Sá Vasconcelos Uchoa (87 9 9626-3253)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Malha & Cia'
      AND user_id = v_user_id
  );

  -- Lead 76: Corretora de Imóveis e Advogada
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '46eb7ce0-0e63-46a2-a6e1-a317b959c591', 'Josihilda Rodrigues dos Santos Carvalho', 'Corretora de Imóveis e Advogada', 'Imóveis (Região de Aldeia)', '5581981635581',
    'josihilda@gmail.com', '@josihildacorretora',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Corretora de Imóveis e Advogada'
      AND user_id = v_user_id
  );

  -- Lead 77: Contatos Contabilidade
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '530bd3cc-0aec-44ab-9beb-b602392508e6', 'Karla Luciana Lemos Rosendo da Silva', 'Contatos Contabilidade', 'Contabilidade', '5581998580037',
    'dp01@contatoscontabilidade.com.br', NULL,
    'ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Lidiane Rezende Ramos (81 9 9784-4546)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Contatos Contabilidade'
      AND user_id = v_user_id
  );

  -- Lead 78: Aliança NE
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '5368fdfa-f93b-425e-b17c-f66d21ac875c', 'Kleberson Ricardo Da Silva Morais', 'Aliança NE', 'Telecomunicação', '5581996155160',
    'krmorais79@gmail.com', '@kricardomorais',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Aliança NE'
      AND user_id = v_user_id
  );

  -- Lead 79: RR Prado - Araújo & Prado
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '29958c2f-7fd7-4eba-82cb-f5e31cb315ae', 'Leduar Vasconcelos de Araújo', 'RR Prado - Araújo & Prado', 'Financiamento Imobiliário / Franquia de Lavanderia', '5581994059007',
    'leduarvas@hotmail.com', '@rrprado.caixa',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'RR Prado - Araújo & Prado'
      AND user_id = v_user_id
  );

  -- Lead 80: Coisas de Mulher
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '8f14be46-d6dc-4b9d-8052-d75565e2bdee', 'Lidiane Bezerra da Silva', 'Coisas de Mulher', 'Atacado / Varejo', '5581998026500',
    'distribuidoracoisasdemulher@hotmail.com', NULL,
    'ICP: Alta | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Coisas de Mulher'
      AND user_id = v_user_id
  );

  -- Lead 81: Monde de Jan Cabeleireiros
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'bc4cbe3b-9f27-475c-8c9b-af4ea807cc46', 'Lorena Araújo Braga', 'Monde de Jan Cabeleireiros', 'Serviço (beleza)', '5581996638176',
    'lorenaaraujobraga@gmail.com', '@mondedejan',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Monde de Jan Cabeleireiros'
      AND user_id = v_user_id
  );

  -- Lead 82: Blue Mar
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '62dcc62c-5230-483e-a3e5-8cfa67048fe1', 'Luzi Gomes', 'Blue Mar', 'Indústria de Moda Praia', '5581987899427',
    'luziblue1@gmail.com', '@bluemarmodapraia',
    'ICP: Alta | Fonte: Caruaru + Encontro | Outros contatos deste lead: Luzi Gomes (81 9 9483-6873)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Blue Mar'
      AND user_id = v_user_id
  );

  -- Lead 83: Madson Marcello - Psicólogo NR1
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '5cc021d4-3f33-470e-af2c-6ce29459d56e', 'Madson Marcello Albuquerque', 'Madson Marcello - Psicólogo NR1', 'Psicologia / Consultoria de Empresas', '5581988080808',
    'madsonmarcello@hotmail.com', NULL,
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Madson Marcello - Psicólogo NR1'
      AND user_id = v_user_id
  );

  -- Lead 84: TGT Advogados
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '4fff14e6-9d5b-4df2-99df-67583a1cbd80', 'Marcelo Campelo Arribas', 'TGT Advogados', 'Direito Empresarial e Cível', '5581989013232',
    'marcelo@tgt.adv.br', '@tenorioguedesetorres',
    'ICP: Média | Fonte: Caruaru + Encontro | Outros contatos deste lead: Maria Clara Araújo dos Santos (81 9 8355-1612), Luca de Godoy Santiago (81 9 9185-5537), Marcelo Campelo Arribas (81 9 8901-3232)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'TGT Advogados'
      AND user_id = v_user_id
  );

  -- Lead 85: Gilberto Contabilidade
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '59b6635f-b2a9-4f16-8f41-e2d2dd4b1394', 'Maria Gabriela da Silva Dias', 'Gilberto Contabilidade', 'Escritório Contábil', '5581994843913',
    'gabrieladias@escgilberto.net', '@gilbertocontabilidade',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Gilberto Contabilidade'
      AND user_id = v_user_id
  );

  -- Lead 86: MG Negócios e Serviços LTDA
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'f5392748-9603-4088-8908-ccd63dcc1503', 'Michela Cristiane Gomes da Silva', 'MG Negócios e Serviços LTDA', 'Serviços', '5581987521716',
    'gomesmichela54@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'MG Negócios e Serviços LTDA'
      AND user_id = v_user_id
  );

  -- Lead 87: Eventos de Beleza / Cosméticos
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '917e1017-cfd5-481d-877b-5110350700c7', 'Mozart Correa Dornelas', 'Eventos de Beleza / Cosméticos', 'Eventos / Beleza', '5522999559206',
    'mozartcorrea@yahoo.com.br', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Eventos de Beleza / Cosméticos'
      AND user_id = v_user_id
  );

  -- Lead 88: Instituto de Pesquisa Avançada e Soluções (IPASI)
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'c11f91c0-4f73-40b1-9907-80dc2d042339', 'Otilio Joaquim da Silva Filho', 'Instituto de Pesquisa Avançada e Soluções (IPASI)', 'Instituto / Pesquisa', '5581933009289',
    'diretoria@ipasi.org.br', NULL,
    'ICP: Baixa | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Instituto de Pesquisa Avançada e Soluções (IPASI)'
      AND user_id = v_user_id
  );

  -- Lead 89: Jessy Black Eventos
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'c8b68731-2b10-4e9f-b994-dfd6ef2ad56c', 'Paulo Jessyvon Lemos da Silva', 'Jessy Black Eventos', 'Eventos', '5581998980618',
    'jessyblack.jl2@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Jessy Black Eventos'
      AND user_id = v_user_id
  );

  -- Lead 90: RF Descartáveis
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '274816a4-c4e4-43f9-b63c-0e8bf0e5e273', 'Pedro Ribeiro Ferraz Junior', 'RF Descartáveis', 'Embalagens', '5581987893515',
    'prfj1978@hotmail.com', NULL,
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'RF Descartáveis'
      AND user_id = v_user_id
  );

  -- Lead 91: Grupo Sellexa
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '8db1c3ea-496e-4c6d-916b-17c52ab56ce7', 'Phelipe Fernandes da Silva', 'Grupo Sellexa', 'Estruturação e Assessoria Comercial', '5581996604258',
    'phelipe@gruposellexa.com', '@gruposellexa',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Grupo Sellexa'
      AND user_id = v_user_id
  );

  -- Lead 92: Gape Sports Material Esportivo
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'f98f446f-5274-4f17-a85a-b720aa063c9f', 'Polyanna Saraiva Alencar Gomes', 'Gape Sports Material Esportivo', 'Varejo / Esportivo', '5581992379477',
    'contato@gapesports.com.br', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Gape Sports Material Esportivo'
      AND user_id = v_user_id
  );

  -- Lead 93: Salão de Beleza
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '1cbb8d45-7973-497e-ac0f-25f2036597d8', 'Priscilla Vila Nova', 'Salão de Beleza', 'Estética', '5581991561970',
    '—', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Salão de Beleza'
      AND user_id = v_user_id
  );

  -- Lead 94: Soleil Energia
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'b73a936e-253b-49e8-9a67-721bb3241aa0', 'Rafael Henrique Aragão Ribeiro', 'Soleil Energia', 'Energia Solar', '5581999631001',
    'rafa1001@gmail.com', '@soleil.energia',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Soleil Energia'
      AND user_id = v_user_id
  );

  -- Lead 95: Oowe Company / Gow Leads
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '2e55ed6c-f709-46c2-96a3-19911b1f7d25', 'Rafael Menezes', 'Oowe Company / Gow Leads', 'Vendas / Tecnologia', '5581988527773',
    'rafael@oowe.company', '@oowecompany',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Oowe Company / Gow Leads'
      AND user_id = v_user_id
  );

  -- Lead 96: Ricardo Leal Imóveis
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '95aa8a9b-b7eb-4c99-b06b-289dde08f66f', 'Ricardo Alexandre de Barros Leal', 'Ricardo Leal Imóveis', 'Imobiliário', '5581999402191',
    'ricardoleal0911@outlook.com', NULL,
    'ICP: Alta | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Ricardo Leal Imóveis'
      AND user_id = v_user_id
  );

  -- Lead 97: Grupo RM
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '81762035-489f-4119-984d-9031114af9c3', 'Rilson Maciel de Oliveira Filho', 'Grupo RM', 'Alimentação, Entretenimento, Construção', '5581998006060',
    'rilsonf@hotmail.com', '@rilsonf',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Grupo RM'
      AND user_id = v_user_id
  );

  -- Lead 98: Mídia Certa Brindes / Concórdia Placas
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '7581149a-bd9c-4320-bdc7-a0fe2f0989b9', 'Roberta Mendes Silva', 'Mídia Certa Brindes / Concórdia Placas', 'Brindes, Placas, Troféus', '5581996758742',
    'mideacertabrindes@hotmail.com', '@concordiaplacas',
    'ICP: Média | Fonte: Caruaru + Encontro | Outros contatos deste lead: Mônica Limeira Urbano / Charles Henrique (81 9 9675-8742)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Mídia Certa Brindes / Concórdia Placas'
      AND user_id = v_user_id
  );

  -- Lead 99: Rei dos Consórcios
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'e1d5e669-c482-4514-8c81-82fff46d7752', 'Robson Diniz Galindo', 'Rei dos Consórcios', 'Consórcio', '5581998888016',
    'robsondinizgalindo@outlook.com', '@rei.dosconsorcios',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Rei dos Consórcios'
      AND user_id = v_user_id
  );

  -- Lead 100: Distribuidora Parceria Food Service
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'aa2665a9-318e-4810-8aa8-8a8df0bbda8f', 'Rommel Fabrício Pinheiro Moreira', 'Distribuidora Parceria Food Service', 'Distribuidora Food Service', '5581986997329',
    'thaysalbuquerque@hotmail.com', '@parceriafoods',
    'ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Thays Figueiroa Albuquerque (81 9 8559-5394)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Distribuidora Parceria Food Service'
      AND user_id = v_user_id
  );

  -- Lead 101: Supermercado do Óleo
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'f94fbf37-3446-483b-9d6d-4412239a87cf', 'Ronaldo de Araújo Pereira', 'Supermercado do Óleo', 'Oficina Mecânica', '5581989083241',
    'ronaldopereira_ronaldopereira@hotmail.com', '@supermercadodooleo',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Supermercado do Óleo'
      AND user_id = v_user_id
  );

  -- Lead 102: Sandra Alves (marca pessoal)
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '7a068f4f-5a67-48e6-90a0-7a20d944e385', 'Sandra Alves', 'Sandra Alves (marca pessoal)', 'Desenvolvimento Pessoal', '5581985470665',
    'sandraalves.coach@gmail.com', '@eusousandraalves',
    'ICP: Baixa | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Sandra Alves (marca pessoal)'
      AND user_id = v_user_id
  );

  -- Lead 103: Psicologia / Constelação Familiar
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '0dd199fd-b2fb-412f-8ff2-067c6981ceb5', 'Shirley Freitas Do Carmo', 'Psicologia / Constelação Familiar', 'Saúde / Bem-estar', '5581995551309',
    'shirleyfreitaspsi@gmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Psicologia / Constelação Familiar'
      AND user_id = v_user_id
  );

  -- Lead 104: Ágape Educação
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '39592a84-2f4a-4803-a710-5fb4bca7b918', 'Soraya de Jesus da Silva Tabosa', 'Ágape Educação', 'Educação', '5581989021331',
    'direcao@educacaoagape.com.br', NULL,
    'ICP: Baixa | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Ágape Educação'
      AND user_id = v_user_id
  );

  -- Lead 105: Tatiana Castro Advocacia
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '41b4f947-b1dd-45ca-ba71-1f1a8cd0fdd3', 'Tatiana Alice Moura de Castro Ribeiro', 'Tatiana Castro Advocacia', 'Advocacia', '5581999798785',
    'tatianacastroadvocacia@gmail.com', '@tatianacastroadv',
    'ICP: Alta | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Tatiana Castro Advocacia'
      AND user_id = v_user_id
  );

  -- Lead 106: TBS Auto Center
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'b3f8996b-8d7e-40da-8336-67607da23530', 'Thiago Bezerra Sales', 'TBS Auto Center', 'Reparação Automotiva', '5581998075557',
    'adm@tbsautocenter.com', '@pointstbs',
    'ICP: Média | Fonte: Encontro | Outros contatos deste lead: Virgilio Martins Sales (81 9 9788-0579)', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'TBS Auto Center'
      AND user_id = v_user_id
  );

  -- Lead 107: Andrade Produções e Eventos
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'eecd9297-3790-4d00-8b36-ac27ef988d70', 'Tiago Andrade de Souza', 'Andrade Produções e Eventos', 'Estruturas para Eventos e Shows', '5581991303910',
    'andradeproducoes07@gmail.com', '@andradeproducoeseventos',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Andrade Produções e Eventos'
      AND user_id = v_user_id
  );

  -- Lead 108: Sam Med (ambulância)
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    'ad3cff0f-276a-4125-8537-7345bd41a424', 'Ubirajara José de Lima Silva', 'Sam Med (ambulância)', 'Saúde - Atendimento Pré-Hospitalar', '5581988658035',
    'bira_pe94@hotmail.com', '@sammedrec',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Sam Med (ambulância)'
      AND user_id = v_user_id
  );

  -- Lead 109: Datawan
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '2dad9078-9d20-4f8e-826d-d13c93a358a2', 'Victor Marinho', 'Datawan', 'Tecnologia / TI', '5581993908954',
    'victor.marinho@datawan.com.br', NULL,
    'ICP: Alta | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Datawan'
      AND user_id = v_user_id
  );

  -- Lead 110: KS Hipnoterapia
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '5e2d4839-a7d8-44b2-b86b-cf5da1d644d4', 'Wedna Keila Santos Silva', 'KS Hipnoterapia', 'Saúde / Bem-estar', '5581996703642',
    'wednakeila@hotmail.com', NULL,
    'ICP: Média | Fonte: Caruaru', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'KS Hipnoterapia'
      AND user_id = v_user_id
  );

  -- Lead 111: Loja CRF Colchões / Franqueada Ortobom
  INSERT INTO public.leads_prospeccao (
    id, lead, empresa, categoria, whatsapp, email, instagram,
    resumo_analitico, origem, status, estagio_pipeline,
    status_msg_wa, modo_atendimento, user_id, tenant_id,
    data_ultima_interacao, created_at, updated_at
  ) SELECT
    '7e0e5a5f-b91e-4603-b957-6b175674de9f', 'Wilson Guedes', 'Loja CRF Colchões / Franqueada Ortobom', 'Colchões', '5581985047032',
    'wilson.monster10@gmail.com', '@ortobomcrf',
    'ICP: Média | Fonte: Encontro', 'evento_encontro_relacionamento', 'Novo', 'Novo',
    'not_sent', 'bot', v_user_id, 'intellix',
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.leads_prospeccao
    WHERE tenant_id = 'intellix'
      AND empresa ILIKE 'Loja CRF Colchões / Franqueada Ortobom'
      AND user_id = v_user_id
  );

END $$;

-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
SELECT 'auth_user'    AS check_item, id::text AS result FROM auth.users WHERE email = 'contato@intellixai.com.br'
UNION ALL
SELECT 'user_settings' , provider || ' | pending_setup=' || pending_setup::text FROM public.user_settings WHERE user_id = (SELECT id FROM auth.users WHERE email = 'contato@intellixai.com.br')
UNION ALL
SELECT 'agent_configs' , model || ' | active=' || is_active::text FROM public.agent_configs WHERE user_id = (SELECT id FROM auth.users WHERE email = 'contato@intellixai.com.br') AND is_active = true
UNION ALL
SELECT 'leads_count'   , COUNT(*)::text FROM public.leads_prospeccao WHERE tenant_id = 'intellix';