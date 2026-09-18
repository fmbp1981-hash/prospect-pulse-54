// IDs de industry do LinkedIn aceitos pelo actor Apify harvestapi/linkedin-profile-search
// (parâmetro industryIds). Lista completa oficial:
// https://github.com/HarvestAPI/linkedin-industry-codes-v2/blob/main/linkedin_industry_code_v2_all_eng_with_header.csv
// Curadoria abaixo: só os segmentos mais relevantes para prospecção B2B, traduzidos para pt-BR.
export interface IndustryCategory {
  category: string;
  industries: { id: number; label: string }[];
}

export const LINKEDIN_INDUSTRIES: IndustryCategory[] = [
  {
    category: "Tecnologia",
    industries: [
      { id: 1594, label: "Tecnologia, Informação e Mídia" },
      { id: 6, label: "Tecnologia da Informação e Internet" },
      { id: 3133, label: "Mídia e Telecomunicações" },
    ],
  },
  {
    category: "Serviços Financeiros",
    industries: [
      { id: 43, label: "Serviços Financeiros" },
      { id: 129, label: "Mercado de Capitais" },
      { id: 1673, label: "Intermediação de Crédito" },
      { id: 42, label: "Seguros" },
      { id: 1742, label: "Fundos e Fundações" },
    ],
  },
  {
    category: "Serviços Profissionais",
    industries: [
      { id: 1810, label: "Serviços Profissionais" },
      { id: 11, label: "Consultoria Empresarial" },
      { id: 96, label: "TI e Consultoria de TI" },
      { id: 47, label: "Contabilidade" },
      { id: 10, label: "Serviços Jurídicos" },
      { id: 80, label: "Publicidade" },
      { id: 50, label: "Arquitetura e Planejamento" },
      { id: 99, label: "Design" },
      { id: 3242, label: "Engenharia" },
      { id: 70, label: "Pesquisa" },
    ],
  },
  {
    category: "Varejo",
    industries: [
      { id: 27, label: "Varejo" },
      { id: 19, label: "Moda e Vestuário" },
      { id: 1445, label: "E-commerce" },
      { id: 1339, label: "Alimentos e Bebidas (Varejo)" },
      { id: 1359, label: "Saúde e Cuidados Pessoais (Varejo)" },
      { id: 1309, label: "Móveis e Decoração (Varejo)" },
      { id: 1324, label: "Materiais de Construção e Jardim" },
      { id: 143, label: "Artigos de Luxo e Joias" },
    ],
  },
  {
    category: "Indústria e Manufatura",
    industries: [
      { id: 25, label: "Manufatura" },
      { id: 23, label: "Alimentos e Bebidas (Indústria)" },
      { id: 598, label: "Confecção/Vestuário" },
      { id: 60, label: "Têxtil" },
      { id: 26, label: "Móveis (Indústria)" },
      { id: 55, label: "Máquinas e Equipamentos" },
      { id: 24, label: "Computadores e Eletrônicos" },
      { id: 17, label: "Equipamentos Médicos" },
    ],
  },
  {
    category: "Saúde",
    industries: [
      { id: 14, label: "Hospitais e Saúde" },
      { id: 13, label: "Clínicas Médicas" },
      { id: 2081, label: "Hospitais" },
      { id: 88, label: "Serviços a Indivíduos e Famílias" },
      { id: 2091, label: "Casas de Repouso e Cuidado" },
    ],
  },
  {
    category: "Construção e Imóveis",
    industries: [
      { id: 48, label: "Construção" },
      { id: 406, label: "Construção de Edifícios" },
      { id: 51, label: "Engenharia Civil" },
      { id: 435, label: "Contratação Especializada" },
      { id: 44, label: "Imóveis" },
      { id: 1779, label: "Locação de Equipamentos" },
    ],
  },
  {
    category: "Educação",
    industries: [
      { id: 1999, label: "Educação" },
      { id: 68, label: "Ensino Superior" },
      { id: 67, label: "Ensino Fundamental e Médio" },
      { id: 105, label: "Treinamento e Coaching Profissional" },
      { id: 132, label: "Plataformas de E-learning" },
      { id: 2018, label: "Ensino Técnico e Profissionalizante" },
    ],
  },
  {
    category: "Transporte e Logística",
    industries: [
      { id: 116, label: "Transporte e Logística" },
      { id: 87, label: "Transporte de Cargas" },
      { id: 92, label: "Transporte Rodoviário" },
      { id: 93, label: "Armazenagem" },
      { id: 94, label: "Aviação" },
      { id: 1495, label: "Transporte de Passageiros" },
    ],
  },
  {
    category: "Atacado e Distribuição",
    industries: [
      { id: 133, label: "Atacado/Distribuição" },
      { id: 1231, label: "Alimentos e Bebidas (Atacado)" },
      { id: 1128, label: "Veículos e Autopeças (Atacado)" },
      { id: 134, label: "Importação e Exportação" },
      { id: 1187, label: "Máquinas (Atacado)" },
    ],
  },
  {
    category: "Alimentação e Hospitalidade",
    industries: [
      { id: 2190, label: "Hospitalidade" },
      { id: 34, label: "Alimentação e Bebidas (Serviços)" },
      { id: 32, label: "Restaurantes" },
      { id: 31, label: "Hotelaria" },
      { id: 2194, label: "Hotéis e Motéis" },
    ],
  },
  {
    category: "Serviços ao Consumidor",
    industries: [
      { id: 91, label: "Serviços ao Consumidor" },
      { id: 2258, label: "Serviços Pessoais e Lavanderia" },
      { id: 2225, label: "Reparo e Manutenção" },
      { id: 2318, label: "Serviços Domésticos" },
      { id: 100, label: "Organizações sem fins lucrativos" },
    ],
  },
  {
    category: "Administrativo e Apoio",
    industries: [
      { id: 1912, label: "Serviços Administrativos e de Apoio" },
      { id: 104, label: "Recrutamento e Seleção" },
      { id: 122, label: "Serviços de Facilities" },
      { id: 121, label: "Segurança e Investigação" },
      { id: 1931, label: "Telemarketing/Call Center" },
    ],
  },
  {
    category: "Governo",
    industries: [
      { id: 75, label: "Administração Pública" },
      { id: 79, label: "Políticas Públicas" },
      { id: 2353, label: "Saúde e Assistência Social (Governo)" },
    ],
  },
  {
    category: "Agropecuária",
    industries: [
      { id: 201, label: "Agropecuária, Pecuária e Florestal" },
      { id: 63, label: "Agricultura" },
      { id: 256, label: "Pecuária e Pesca" },
      { id: 298, label: "Silvicultura e Extração de Madeira" },
    ],
  },
  {
    category: "Energia e Utilidades",
    industries: [
      { id: 59, label: "Utilidades (Energia/Água/Gás)" },
      { id: 383, label: "Geração de Energia Elétrica" },
      { id: 332, label: "Petróleo, Gás e Mineração" },
      { id: 57, label: "Petróleo e Gás" },
      { id: 56, label: "Mineração" },
    ],
  },
  {
    category: "Entretenimento",
    industries: [
      { id: 28, label: "Entretenimento" },
      { id: 40, label: "Instalações Recreativas" },
      { id: 2130, label: "Artes Cênicas e Esportes" },
    ],
  },
  {
    category: "Holdings",
    industries: [
      { id: 1905, label: "Holdings" },
    ],
  },
];
