-- ============================================================
-- SETUP IntelliX Tenant — LeadFinder Pro
-- Execute no Supabase SQL Editor — projeto kzvnwqlcrtxwagxkghxq
-- ============================================================

-- ── 0. SCHEMA PATCHES ─────────────────────────────────────────────────────────
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

-- ── T1a. CRIAR USUÁRIO AUTH ──────────────────────────────────────────────────
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
  now(), now(), '', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'contato@intellixai.com.br');

-- ── T1b. UPSERT USER_SETTINGS ────────────────────────────────────────────────
INSERT INTO public.user_settings (
  user_id, company_name, role, provider, consultant_whatsapp,
  integration_configured, pending_setup, agent_enabled, created_at, updated_at
)
SELECT
  u.id, 'IntelliX.AI', 'admin', 'meta', '5581988514775',
  true, false, true, now(), now()
FROM auth.users u WHERE u.email = 'contato@intellixai.com.br'
ON CONFLICT (user_id) DO UPDATE SET
  company_name           = EXCLUDED.company_name,
  role                   = 'admin'::user_role,
  provider               = EXCLUDED.provider,
  consultant_whatsapp    = EXCLUDED.consultant_whatsapp,
  integration_configured = true,
  pending_setup          = false,
  agent_enabled          = true,
  updated_at             = now();

-- ── T5. AGENT CONFIG — BIA V1 ────────────────────────────────────────────────
UPDATE public.agent_configs
SET is_active = false
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'contato@intellixai.com.br')
  AND is_active = true;

INSERT INTO public.agent_configs (
  id, user_id, name, system_prompt, prompt_version,
  model, temperature, max_iterations, is_active, created_at, updated_at
)
SELECT
  gen_random_uuid(), u.id,
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
  'custom', 'gpt-4.1', 0.60, 5, true, now(), now()
FROM auth.users u
WHERE u.email = 'contato@intellixai.com.br'
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_configs
    WHERE user_id = u.id AND name = 'IntelliX SDR — Bia v1'
  );

-- ── T4. IMPORTAR 111 LEADS ───────────────────────────────────────────────────
WITH
  u AS (SELECT id FROM auth.users WHERE email = 'contato@intellixai.com.br'),
  src (nome,empresa,categoria,whatsapp,email,instagram,resumo,modo) AS (VALUES
  ('Ademilson da Silva Fonseca','Recife Caixas Indústria de Embalagens','Indústria de Papelão','5581984250782','fonseca.sudperbambuco@gmail.com','@fonsecajornadadoempreendedor','ICP: Alta | Fonte: Encontro','bot'),
  ('Admilson F Queiroz Junior','Grupo Rede','Contabilidade / Serviços','5581995162299','juninhowqueiroz@hotmail.com',NULL,'ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Adriano Fernando dos Santos (81 9 9248-5894), Rayanne Moura (81 9 9898-2565), Tiago Costa Moura (81 9 9459-0340)','bot'),
  ('Adriana dos Anjos Brito','Engtec Engenharia e Manutenção','Refrigeração e Climatização','5581996641330','adriana.brito@engtecmanutencao.com','@engtecmanutencao','ICP: Média | Fonte: Caruaru + Encontro | Outros contatos deste lead: Ícaro Estêvão de Oliveira Costa (81 9 9998-1558), Adriana dos Anjos Brito (81 9 9664-1330), Ícaro Estêvão de Oliveira Costa (81 9 9998-1558), Rildo Cavalcanti da Silva (81 9 9801-6000)','bot'),
  ('Adriano Negrini Costa Manso','Criare / Italinea - Móveis Planejados','Móveis Planejados (alto padrão)','5581991123801','adriano@confianceplanejados.com.br','@negriniadrianocm','ICP: Alta | Fonte: Encontro','bot'),
  ('Alberto José da Costa Lima Cavendish Moreira','Cavendish Consultoria / Incorporadora Be Your Home','Incorporação e consultoria empresarial','5581988763085','contato@grupocavendish.com.br','@grupocavendish','ICP: Alta | Fonte: Encontro','bot'),
  ('Alexandre Borba Gurgel Do Amaral','MD Vendas - Investimentos Imobiliários','Imóveis','5581981878788','alexandre.gurgel@mdvendas.com.br','@alexandregurguel78','ICP: Alta | Fonte: Encontro','bot'),
  ('Alexandre de Oliveira Siqueira','Agência Ágil','Tráfego pago','5581996421010','alexandre.agilmkt@gmail.com','@alexandresiqueiraconsult','ICP: Média | Fonte: Encontro','bot'),
  ('Alexandre Santos','Recsun Energia Solar','Energia Solar','5581999940127','alexandresantos@recsunenergia.com',NULL,'ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Suzanna Dias (81 9 9994-0211)','bot'),
  ('Alexandre Tavares','Smarthec Náutica','Náutica (estaleiros, embarcações, iates)','5581987911583','alexandre@smarthec.com.br','@smarthecnautica','ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Patrícia Wanessa Nunes Aires Tavares (81 9 8791-1585)','bot'),
  ('Alexssandro Farias de Barros','AF Consultoria Empresarial & Coaching','Consultoria',NULL,'alexssandro_pe@hotmail.com',NULL,'ICP: Alta | Fonte: Caruaru | Número fora do padrão — conferir','humano'),
  ('Aline Crescêncio Pedrosa','Agência Ozan','Marketing','5581982500162','alinecrescencio2008@hotmail.com','@line_pedrosa','ICP: Média | Fonte: Encontro','bot'),
  ('Aline Ramos Lima de Godoy','Lima e Maia Sociedade de Advogados','Planejamento Patrimonial e Sucessório','5581999689999','aline@limaemaia.adv.br','@limaemaia.adv','ICP: Média | Fonte: Encontro | Outros contatos deste lead: Kyara Amorim Maia Thorpe (81 9 9696-0710)','bot'),
  ('Álvaro Fonseca Da Silva','Brasil Gourmet','Supermercados, Atacado e Distribuição','5583999443375','brasilgourmetadm@hotmail.com','@brasilgourmetalimentos','ICP: Alta | Fonte: Encontro','bot'),
  ('Ana Luíza de Oliveira Lima França','232 Burguer / Terraço da Praça','Restaurantes','5581997311968','analuizaolf@gmail.com','@232burguer','ICP: Média | Fonte: Caruaru + Encontro | Outros contatos deste lead: José Diego Nemesio Beltrão (81 9 9666-1154), Ana Luíza de Oliveira Lima França (81 9 9731-1968), José Diego Nemesio Beltrão (81 9 9666-1154)','bot'),
  ('Ana Maria Rodrigues da Silva','Estruturar Consultoria','Consultoria em Estrutura Organizacional','5581999108980','estruturarconsultoria@gmail.com','@anarodriguesconsultora','ICP: Alta | Fonte: Encontro','bot'),
  ('Anderson Candido Alves','Agência Valore','Marketing / Comunicação','5581973139693','anderson@agenciavalore.com.br',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Anderson De Oliveira Lacerda','Guaray Pirotecnia','Fogos de Artifício','5581997471087','anderson@guaraypirotecnia.com.br','@guaray.pirotecnia','ICP: Média | Fonte: Encontro','bot'),
  ('Anderson Lourenço Barbosa da Silva','Kabyte','Suporte de TI com Cibersegurança','5581996388485','anderson@kabyte.com.br','@kabyte','ICP: Alta | Fonte: Caruaru + Encontro | Outros contatos deste lead: Anderson Lourenço Barbosa da Silva (81 9 9638-8485)','bot'),
  ('Andréa Brito','Arya','Harmonização Orofacial','5551991759133','doutora.andreabrito@hotmail.com','@dra.andreabrito','ICP: Média | Fonte: Encontro','bot'),
  ('Ângela Maria da Costa Dantas','Studio de Beleza / Podcast','Estética / Mídia','5581994318161','contatoangeladantas@gmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Aparecida Ferreira da Silva','Instrutora de Trânsito (autônoma)','Educação / Serviços','5581989667472','aparecida.aquiles84@gmail.com',NULL,'ICP: Baixa | Fonte: Caruaru','bot'),
  ('Bernardino Francisco Borba Fernandes','APS Tecnologia','Tecnologia / TI','5581997801192','berna21@gmail.com',NULL,'ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Tiago Henrique Montezuma Belo (81 9 9755-0359)','bot'),
  ('Brenda de Freiras Janeiro Duran','Autônoma - Corretora de Imóveis','Imóveis de Médio a Alto Padrão','5581999968288','brendajduran@hotmail.com','@tenhoseuimovel','ICP: Alta | Fonte: Encontro','bot'),
  ('Breno de Morais Tompson Chateaubriand','TR Engenharia Incorporadora','Construção Civil','5581999655556','brenomtc@hotmail.com','@tr_engenharia_','ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Tiago Henrique Monteiro Rocha (81 9 9791-4875)','bot'),
  ('Camilla Santana','Camilla Santana Advocacia','Trabalhista Empresarial','5581996054626','camillasantanaadv@gmail.com','@camillasantanado','ICP: Média | Fonte: Encontro','bot'),
  ('Carla Andrea Bacelar Ramos','Comunicação Estratégica e Oratória','Treinamento para Empresas e Executivos','5581991146020','carlaandreabr@hotmail.com','@carlabacelarr','ICP: Média | Fonte: Encontro','bot'),
  ('Carlos José Melo de França','Kmoveis Móveis','Móveis Corporativo e Residencial','5581996893409','kmoveissobmedidape@gmail.com',NULL,'ICP: Média | Fonte: Encontro','bot'),
  ('Carlos Rodrigo Ferraz Silvestre','Grupo Ferraz','Diversos / Holding','5587999544591','rodrigoferraz40@gmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Cleyton Douglas Vieira Da Silva','Datamotion / Traderxplosion','Financeiro / Tecnologia','5581999102754','cleytond70@gmail.com',NULL,'ICP: Alta | Fonte: Encontro','bot'),
  ('Cris Silva','Kless Planejados','Móveis Planejados','5511965290048','nilssoncfferreira@gmail.com',NULL,'ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Nilsson Costa (sem tel)','bot'),
  ('Débora Karla Rodrigues Seabra','Execute Consórcio Ltda','Consórcio / Financeiro','5581994109558','executeconsorcio@gmail.com',NULL,'ICP: Alta | Fonte: Caruaru','bot'),
  ('Denise Freiria','Freiria Corretora de Seguros','Seguros','5581998146001','freiria.denise@gmail.com','@freiriacorretora','ICP: Alta | Fonte: Encontro','bot'),
  ('Dinara Murta','Dinara Murta (marca pessoal)','Marca Pessoal','5581994322064','dinaramurta37@gmail.com','@dinaramurta','ICP: Baixa | Fonte: Encontro','bot'),
  ('Ed Eky Pires Dantas','ACIC - Associação Comercial e Empresarial','Associação Comercial','5581994519628','direcexec@aciccaruaru.com.br',NULL,'ICP: Baixa | Fonte: Caruaru | Outros contatos deste lead: Geraldo Pinheiro da Silva Junior (81 9 9128-1117), Maria Jullyana Alves de Lima (81 9 9133-4146)','bot'),
  ('Edcarlos Lucena','Nina Baby','Varejo / Comércio','5575992362810','ninababybags@gmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Edcarlos Pereira dos Santos','Nossa Associados e Clube de Benefícios','Clube de Benefícios / Serviços','5587996343239','edcarlos.pereira@hotmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Edilma Queiroz','Plaza Colchões / Franqueada Ortobom','Colchões','5581999859627','edilmaqueiroz1@hotmail.com','@ortobomshoppingplaza','ICP: Média | Fonte: Encontro','bot'),
  ('Eliane Maria Januário Teixeira','Lia Cosméticos','Cosméticos / Varejo','5581989447117','—',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Elida Maria de Arruda e Souza','Clínica Odontobem','Saúde / Odontologia','5581997090173','elida.arruda18@gmail.com',NULL,'ICP: Alta | Fonte: Caruaru','bot'),
  ('Émerson Silva Cavalcanti','EJW','Proteção Veicular','5581996630103','oboegoverno@gmail.com','@emersoncavalcantiofc','ICP: Média | Fonte: Encontro','bot'),
  ('Emily Carvalho','Agência Moratori','Marketing / Comunicação','5581982075112','emilycarvalhomkt@gmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Fatima Cristina Freire de Lucena','FC Atacadista','Distribuidora de Higiene e Limpeza','5581998506604','nrfatimalucena1@hotmail.com','@Fcatacadistaa','ICP: Alta | Fonte: Caruaru + Encontro | Outros contatos deste lead: Maria Amélia Dias da Mota (81 9 9626-7514), Drianny Santos de Andrade Polari da Silva (81 9 9223-5431), Ericka Priscilla da Silva Dourado Barros (81 9 8614-6315), Priscilla Ursula Brito Barbosa (81 9 9661-2841), Ubirajara Faustino de Oliveira Junior (81 9 9911-4601)','bot'),
  ('Fernando Roberto Cruz Correia Lima','FRC Lima','Distribuição e Logística','5581981405903','fernandolima17@hotmail.com','@amrdistribuidora','ICP: Alta | Fonte: Encontro','bot'),
  ('Franklin Ferreira','Lideri Telecom','Tecnologia / Telecom','5581982122660','franklin@lideri.com.br','@lideritelecom','ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Icaro Roberto dos Santos Carlos (81 9 9404-5660)','bot'),
  ('Gabriel Urben Silvestre','Urben Lemos Engenharia / Homebot Automação','Construção / Reformas / Automação','5581997024442','gabrielurben@gmail.com',NULL,'ICP: Alta | Fonte: Encontro','bot'),
  ('Gabriel Vieira Chaves','Albuquerque Advocacia (ALBQ)','Jurídico Cível','5581992214448','gabrielvieira@albq.adv.br','@albqadvocacia','ICP: Alta | Fonte: Caruaru + Encontro | Outros contatos deste lead: Guilherme Parízio Guimarães (81 9 8186-5797), Raissa Maria de Albertim Mattos (81 9 9750-1717), Gabriel Vieira Chaves (81 9 9221-4448)','bot'),
  ('Geovana Cristina Pereira Lopes','Opportunity Gestão & Negócios','Finanças','5511910309550','geocplopes@icloud.com','@eusougeovanalopes','ICP: Alta | Fonte: Encontro','bot'),
  ('Glauber Alexandre Freire Martins','GT Automotive','Automotivo','5581996370544','g.martins0022@gmail.com',NULL,'ICP: Média | Fonte: Caruaru | Outros contatos deste lead: Tiago Fontes Martins (81 9 9672-1246)','bot'),
  ('Gleice Valéria Da Silva','G V Da Silva Colchoaria','Comércio Varejista de Colchões','5581997204390','universodoscolchoes2019@gmail.com','@universodoscolchoes_','ICP: Média | Fonte: Encontro','bot'),
  ('Gleycilayne Millena Georgia Silva Sales','Proslab Laboratório Clínico','Saúde / Laboratório','5581993751448','g.sales@live.com',NULL,'ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Weider Gleybson de Souza (81 9 9940-4145)','bot'),
  ('Guilherme Marinho Feitosa','GM Agência - Publicidade e Gestão Artística','Publicidade e Marketing Digital','5594991015550','gmarinhofeitosa@gmail.com','@gmagecias','ICP: Média | Fonte: Encontro | Outros contatos deste lead: Kayky Leão (82 9 9804-3259)','bot'),
  ('Gustavo Candido dos Santos','GWS Comunicação','Marketing / Comunicação','5581997305848','gustavo.santos@gwscomunicacao.com',NULL,'ICP: Média | Fonte: Caruaru | Outros contatos deste lead: Maria Eduarda Pereira do Monte (81 9 9730-5848)','bot'),
  ('Gustavo Mendonça','abtPet - Assoc. Bras. dos Tutores de Pet','Pet','5581988077890','gustavo.mendonca@abtpet.org.br','@abtpet','ICP: Média | Fonte: Encontro','bot'),
  ('Heitor Guilherme Matias Almeida','DExpress Log','Logística','5581996359829','heitormatias1506@outlook.com',NULL,'ICP: Alta | Fonte: Caruaru','bot'),
  ('Hugo Leon Abreu de Santana','Nattú Engenharia','Negócios Imobiliários','5581999098440','hugoleon.arq@gmail.com','@nattueng','ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Mateus Xavier de Alcântara Neres (81 9 9277-0004)','bot'),
  ('Igor Alves de Miranda','Kaya Advisory','Consultoria Financeira','5581995088706','igormiranda@advisory360.com.br','@kayaadvisory360','ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Renata Suellen Fernandes (81 9 8101-3615)','bot'),
  ('Ilregel Alves Semann Filho','Construção Celular / Projehub / Capricho Engenharia','Construção Civil','5581988032551','ilregel@gmail.com',NULL,'ICP: Alta | Fonte: Encontro','bot'),
  ('Irandê Poran Alves Matias','Corretora Franqueada Prudential','Seguros','5581992882917','irande.matias@prudentialfranquia.com',NULL,'ICP: Alta | Fonte: Caruaru','bot'),
  ('Iranise Farias Gomes','Super Estela','Alimentício','5581981298425','superestrelaweb@gmail.com','@Super.estrelaa','ICP: Média | Fonte: Encontro | Outros contatos deste lead: Mateus Joaquim Farias Gomes (81 9 9719-9443)','bot'),
  ('Ivanildo Marcelino da Silva','Wanserver','Tecnologia / TI','5581996181644','marcelino@wanserver.com.br',NULL,'ICP: Alta | Fonte: Caruaru','bot'),
  ('Jeniffer Iriani Barbosa da Silva','Adez Saúde Desportiva','Saúde Desportiva','5581998925863','iriani.jenyffer@gmail.com','@adezsaudedesportiva','ICP: Média | Fonte: Encontro | Outros contatos deste lead: Paulo Roberto Marques Garcia (81 9 9717-7467)','bot'),
  ('João Cláudio da Trindade Meira Henriques','CTI Imobiliária','Imóveis Médio/Alto Padrão','5581991444983','joaoclaudiot@hotmail.com','@joaoclaudio_imoveis','ICP: Alta | Fonte: Encontro','bot'),
  ('João D Azevedo e Silva Neto','Lojão dos Varais','Fabricação e Venda de Varais','5581999883038','joaodazevedo@icloud.com','@dazevedojoao','ICP: Média | Fonte: Encontro','bot'),
  ('João Saulo Soares de Macedo','Diamante Rodas','Automotivo / Comércio','5581992340549','financeiro@diamanterodas.com.br',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('João Victor Malagueta Santana','Santana Eletricidade','Elétrica / Serviços','5581992957056','joaovictor20231234@gmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Jonas Andrade','Moura Dubeux','Construtora / Incorporação','5581999738118','jonas.andrade@mdvendas.com.br','@jonasandrade','ICP: Alta | Fonte: Caruaru + Encontro | Outros contatos deste lead: Eduardo Trajano (81 9 9201-6980), Jonas Andrade (81 9 9973-8118)','bot'),
  ('Jonas Cristiano Gomes Bezerra','Tv Vida Fantástica','Mídia / Comunicação','5581998869588','jonascaruaru@gmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Jônatas Alves de Oliveira','Grupo Jonatas Oliveira','Setor Público','5583991375335','jonatas.diretoria@gmail.com','@o.jonatasoliveira_','ICP: Baixa | Fonte: Encontro','bot'),
  ('Jorge Francisco Xavier','Xavier Representações','Representação Comercial','5581986817758','jxavier.vendas@gmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('José Hélio da Silva Júnior','Business Club','Eventos Educacionais','5581982533372','heliosilva.jr28@gmail.com','@businessclub_vsa','ICP: Média | Fonte: Caruaru + Encontro | Outros contatos deste lead: José Hélio da Silva Júnior (81 9 8253-3372)','bot'),
  ('José Ialison Bezerra da Silva','Energy Brasil Agreste','Energia','5581982736485','ialisonbrow@gmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('José Joelson Pereira','Agilvet - Farmácia Veterinária','Pet / Veterinária','5581981563939','joelsonpereira.jp1@gmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('José Rivaldo Alves da Silva','Grupo Rivas','Diversos / Holding','5581993994530','—',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('José Rodrigo Barbosa Franklin','Vitalitè Clínica Orofacial','Odontologia','5581995443731','rodrigoblx@hotmail.com','@rodrigofbarbosa','ICP: Alta | Fonte: Encontro','bot'),
  ('José Uchoa Neto','Malha & Cia','Têxtil / Confecção','5587996263253','marikessiau@gmail.com',NULL,'ICP: Média | Fonte: Caruaru | Outros contatos deste lead: Maria Kessia Leônidas de Sá Vasconcelos Uchoa (87 9 9626-3253)','bot'),
  ('Josihilda Rodrigues dos Santos Carvalho','Corretora de Imóveis e Advogada','Imóveis (Região de Aldeia)','5581981635581','josihilda@gmail.com','@josihildacorretora','ICP: Alta | Fonte: Encontro','bot'),
  ('Karla Luciana Lemos Rosendo da Silva','Contatos Contabilidade','Contabilidade','5581998580037','dp01@contatoscontabilidade.com.br',NULL,'ICP: Alta | Fonte: Caruaru | Outros contatos deste lead: Lidiane Rezende Ramos (81 9 9784-4546)','bot'),
  ('Kleberson Ricardo Da Silva Morais','Aliança NE','Telecomunicação','5581996155160','krmorais79@gmail.com','@kricardomorais','ICP: Alta | Fonte: Encontro','bot'),
  ('Leduar Vasconcelos de Araújo','RR Prado - Araújo & Prado','Financiamento Imobiliário / Franquia de Lavanderia','5581994059007','leduarvas@hotmail.com','@rrprado.caixa','ICP: Alta | Fonte: Encontro','bot'),
  ('Lidiane Bezerra da Silva','Coisas de Mulher','Atacado / Varejo','5581998026500','distribuidoracoisasdemulher@hotmail.com',NULL,'ICP: Alta | Fonte: Caruaru','bot'),
  ('Lorena Araújo Braga','Monde de Jan Cabeleireiros','Serviço (beleza)','5581996638176','lorenaaraujobraga@gmail.com','@mondedejan','ICP: Média | Fonte: Encontro','bot'),
  ('Luzi Gomes','Blue Mar','Indústria de Moda Praia','5581987899427','luziblue1@gmail.com','@bluemarmodapraia','ICP: Alta | Fonte: Caruaru + Encontro | Outros contatos deste lead: Luzi Gomes (81 9 9483-6873)','bot'),
  ('Madson Marcello Albuquerque','Madson Marcello - Psicólogo NR1','Psicologia / Consultoria de Empresas','5581988080808','madsonmarcello@hotmail.com',NULL,'ICP: Alta | Fonte: Encontro','bot'),
  ('Marcelo Campelo Arribas','TGT Advogados','Direito Empresarial e Cível','5581989013232','marcelo@tgt.adv.br','@tenorioguedesetorres','ICP: Média | Fonte: Caruaru + Encontro | Outros contatos deste lead: Maria Clara Araújo dos Santos (81 9 8355-1612), Luca de Godoy Santiago (81 9 9185-5537), Marcelo Campelo Arribas (81 9 8901-3232)','bot'),
  ('Maria Gabriela da Silva Dias','Gilberto Contabilidade','Escritório Contábil','5581994843913','gabrieladias@escgilberto.net','@gilbertocontabilidade','ICP: Alta | Fonte: Encontro','bot'),
  ('Michela Cristiane Gomes da Silva','MG Negócios e Serviços LTDA','Serviços','5581987521716','gomesmichela54@gmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Mozart Correa Dornelas','Eventos de Beleza / Cosméticos','Eventos / Beleza','5522999559206','mozartcorrea@yahoo.com.br',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Otilio Joaquim da Silva Filho','Instituto de Pesquisa Avançada e Soluções (IPASI)','Instituto / Pesquisa','5581933009289','diretoria@ipasi.org.br',NULL,'ICP: Baixa | Fonte: Caruaru','bot'),
  ('Paulo Jessyvon Lemos da Silva','Jessy Black Eventos','Eventos','5581998980618','jessyblack.jl2@gmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Pedro Ribeiro Ferraz Junior','RF Descartáveis','Embalagens','5581987893515','prfj1978@hotmail.com',NULL,'ICP: Alta | Fonte: Encontro','bot'),
  ('Phelipe Fernandes da Silva','Grupo Sellexa','Estruturação e Assessoria Comercial','5581996604258','phelipe@gruposellexa.com','@gruposellexa','ICP: Média | Fonte: Encontro','bot'),
  ('Polyanna Saraiva Alencar Gomes','Gape Sports Material Esportivo','Varejo / Esportivo','5581992379477','contato@gapesports.com.br',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Priscilla Vila Nova','Salão de Beleza','Estética','5581991561970','—',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Rafael Henrique Aragão Ribeiro','Soleil Energia','Energia Solar','5581999631001','rafa1001@gmail.com','@soleil.energia','ICP: Alta | Fonte: Encontro','bot'),
  ('Rafael Menezes','Oowe Company / Gow Leads','Vendas / Tecnologia','5581988527773','rafael@oowe.company','@oowecompany','ICP: Alta | Fonte: Encontro','bot'),
  ('Ricardo Alexandre de Barros Leal','Ricardo Leal Imóveis','Imobiliário','5581999402191','ricardoleal0911@outlook.com',NULL,'ICP: Alta | Fonte: Caruaru','bot'),
  ('Rilson Maciel de Oliveira Filho','Grupo RM','Alimentação, Entretenimento, Construção','5581998006060','rilsonf@hotmail.com','@rilsonf','ICP: Alta | Fonte: Encontro','bot'),
  ('Roberta Mendes Silva','Mídia Certa Brindes / Concórdia Placas','Brindes, Placas, Troféus','5581996758742','mideacertabrindes@hotmail.com','@concordiaplacas','ICP: Média | Fonte: Caruaru + Encontro | Outros contatos deste lead: Mônica Limeira Urbano / Charles Henrique (81 9 9675-8742)','bot'),
  ('Robson Diniz Galindo','Rei dos Consórcios','Consórcio','5581998888016','robsondinizgalindo@outlook.com','@rei.dosconsorcios','ICP: Alta | Fonte: Encontro','bot'),
  ('Rommel Fabrício Pinheiro Moreira','Distribuidora Parceria Food Service','Distribuidora Food Service','5581986997329','thaysalbuquerque@hotmail.com','@parceriafoods','ICP: Alta | Fonte: Encontro | Outros contatos deste lead: Thays Figueiroa Albuquerque (81 9 8559-5394)','bot'),
  ('Ronaldo de Araújo Pereira','Supermercado do Óleo','Oficina Mecânica','5581989083241','ronaldopereira_ronaldopereira@hotmail.com','@supermercadodooleo','ICP: Média | Fonte: Encontro','bot'),
  ('Sandra Alves','Sandra Alves (marca pessoal)','Desenvolvimento Pessoal','5581985470665','sandraalves.coach@gmail.com','@eusousandraalves','ICP: Baixa | Fonte: Encontro','bot'),
  ('Shirley Freitas Do Carmo','Psicologia / Constelação Familiar','Saúde / Bem-estar','5581995551309','shirleyfreitaspsi@gmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Soraya de Jesus da Silva Tabosa','Ágape Educação','Educação','5581989021331','direcao@educacaoagape.com.br',NULL,'ICP: Baixa | Fonte: Caruaru','bot'),
  ('Tatiana Alice Moura de Castro Ribeiro','Tatiana Castro Advocacia','Advocacia','5581999798785','tatianacastroadvocacia@gmail.com','@tatianacastroadv','ICP: Alta | Fonte: Encontro','bot'),
  ('Thiago Bezerra Sales','TBS Auto Center','Reparação Automotiva','5581998075557','adm@tbsautocenter.com','@pointstbs','ICP: Média | Fonte: Encontro | Outros contatos deste lead: Virgilio Martins Sales (81 9 9788-0579)','bot'),
  ('Tiago Andrade de Souza','Andrade Produções e Eventos','Estruturas para Eventos e Shows','5581991303910','andradeproducoes07@gmail.com','@andradeproducoeseventos','ICP: Média | Fonte: Encontro','bot'),
  ('Ubirajara José de Lima Silva','Sam Med (ambulância)','Saúde - Atendimento Pré-Hospitalar','5581988658035','bira_pe94@hotmail.com','@sammedrec','ICP: Média | Fonte: Encontro','bot'),
  ('Victor Marinho','Datawan','Tecnologia / TI','5581993908954','victor.marinho@datawan.com.br',NULL,'ICP: Alta | Fonte: Caruaru','bot'),
  ('Wedna Keila Santos Silva','KS Hipnoterapia','Saúde / Bem-estar','5581996703642','wednakeila@hotmail.com',NULL,'ICP: Média | Fonte: Caruaru','bot'),
  ('Wilson Guedes','Loja CRF Colchões / Franqueada Ortobom','Colchões','5581985047032','wilson.monster10@gmail.com','@ortobomcrf','ICP: Média | Fonte: Encontro','bot')
  )
INSERT INTO public.leads_prospeccao (
  id, lead, empresa, categoria, whatsapp, email, instagram,
  resumo_analitico, origem, status, estagio_pipeline,
  status_msg_wa, modo_atendimento, user_id, tenant_id,
  data_ultima_interacao, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  src.nome, src.empresa, src.categoria, src.whatsapp, src.email, src.instagram,
  src.resumo, 'evento_encontro_relacionamento', 'Novo', 'Novo',
  'not_sent', src.modo, u.id, 'intellix',
  now(), now(), now()
FROM src CROSS JOIN u
WHERE NOT EXISTS (
  SELECT 1 FROM public.leads_prospeccao lp
  WHERE lp.tenant_id = 'intellix'
    AND lp.empresa ILIKE src.empresa
    AND lp.user_id = u.id
);

-- ── VERIFICAÇÃO ──────────────────────────────────────────────────────────────
SELECT 'auth_user'     AS item, id::text AS resultado
  FROM auth.users WHERE email = 'contato@intellixai.com.br'
UNION ALL
SELECT 'user_settings', provider || ' | pending_setup=' || pending_setup::text
  FROM public.user_settings
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'contato@intellixai.com.br')
UNION ALL
SELECT 'agent_configs', model || ' | active=' || is_active::text
  FROM public.agent_configs
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'contato@intellixai.com.br') AND is_active = true
UNION ALL
SELECT 'leads_count', COUNT(*)::text
  FROM public.leads_prospeccao WHERE tenant_id = 'intellix';
