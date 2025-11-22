import { LocationData } from "@/types/prospection";

export interface NicheCategory {
  category: string;
  niches: string[];
}

export interface QuickLocation {
  city: string;
  state: string;
  country: string;
}

export interface LocationRegion {
  region: string;
  locations: QuickLocation[];
}

export const QUICK_NICHES: NicheCategory[] = [
  {
    category: "Alimentação",
    niches: [
      "Restaurantes",
      "Pizzarias",
      "Lanchonetes",
      "Cafeterias",
      "Padarias",
      "Açougues",
      "Confeitarias",
      "Food Trucks",
      "Hamburguerias",
      "Sushi Bar",
      "Churrascarias",
      "Sorveterias",
      "Distribuidora de Bebidas",
      "Hortifruti"
    ]
  },
  {
    category: "Saúde e Bem-Estar",
    niches: [
      "Clínicas Médicas",
      "Clínicas Odontológicas",
      "Academias",
      "Fisioterapia",
      "Farmácias",
      "Psicólogos",
      "Nutricionistas",
      "Laboratórios",
      "Fonoaudiologia",
      "Quiropraxia",
      "Terapia Ocupacional",
      "Pilates",
      "Yoga",
      "Crossfit"
    ]
  },
  {
    category: "Beleza e Estética",
    niches: [
      "Salões de Beleza",
      "Barbearias",
      "Clínicas de Estética",
      "Manicures",
      "Estúdios de Tatuagem",
      "Spa",
      "Depilação",
      "Design de Sobrancelhas",
      "Maquiadores",
      "Podologia"
    ]
  },
  {
    category: "Comércio e Varejo",
    niches: [
      "Lojas de Roupas",
      "Supermercados",
      "Pet Shops",
      "Lojas de Calçados",
      "Lojas de Eletrônicos",
      "Mercados",
      "Farmácias",
      "Papelarias",
      "Óticas",
      "Lojas de Brinquedos",
      "Lojas de Cosméticos",
      "Lojas de Presentes",
      "Tabacarias",
      "Floriculturas"
    ]
  },
  {
    category: "Serviços",
    niches: [
      "Advocacia",
      "Contabilidade",
      "Imobiliárias",
      "Seguros",
      "Consultoria",
      "Marketing Digital",
      "Assistência Técnica",
      "Chaveiros",
      "Dedetizadora",
      "Desentupidora",
      "Limpeza Pós-Obra",
      "Lavanderias",
      "Costureiras",
      "Gráficas Rápidas"
    ]
  },
  {
    category: "Construção e Reforma",
    niches: [
      "Construtoras",
      "Arquitetura",
      "Marcenarias",
      "Serralheria",
      "Material de Construção",
      "Pintores",
      "Vidraçarias",
      "Marmorarias",
      "Eletricistas",
      "Encanadores",
      "Gesseiros",
      "Lojas de Tintas",
      "Locação de Equipamentos"
    ]
  },
  {
    category: "Automotivo",
    niches: [
      "Oficinas Mecânicas",
      "Lava-Rápidos",
      "Auto Elétricas",
      "Concessionárias",
      "Autopeças",
      "Funilaria",
      "Borracharias",
      "Estética Automotiva",
      "Blindadoras",
      "Lojas de Pneus",
      "Insulfilm"
    ]
  },
  {
    category: "Educação",
    niches: [
      "Escolas",
      "Cursos de Idiomas",
      "Escolas de Música",
      "Escolas de Dança",
      "Cursos Técnicos",
      "Universidades",
      "Reforço Escolar",
      "Cursos Profissionalizantes",
      "Escolas de Informática",
      "Escolas de Natação",
      "Escolas de Artes Marciais",
      "Berçários"
    ]
  },
  {
    category: "Eventos e Festas",
    niches: [
      "Buffets",
      "Casas de Eventos",
      "Cerimonialistas",
      "Decoração de Festas",
      "Aluguel de Trajes",
      "Fotógrafos",
      "DJs e Sonorização",
      "Bolos e Doces para Festas"
    ]
  },
  {
    category: "Tecnologia e Marketing",
    niches: [
      "Assistência Técnica Informática",
      "Lojas de Informática",
      "Desenvolvimento de Software",
      "Coworking",
      "Agências de Marketing",
      "Gestão de Tráfego",
      "Web Design",
      "Agências de SEO",
      "Provedores de Internet"
    ]
  },
  {
    category: "Indústria",
    niches: [
      "Metalúrgica",
      "Têxtil",
      "Gráfica",
      "Confecção",
      "Indústria de Alimentos",
      "Indústria Química",
      "Usinagem",
      "Embalagens"
    ]
  },
  {
    category: "Entretenimento e Lazer",
    niches: [
      "Cinemas",
      "Teatros",
      "Casas de Shows",
      "Boates",
      "Bares",
      "Parques de Diversão",
      "Escape Rooms",
      "Boliches",
      "Fliperamas"
    ]
  },
  {
    category: "Turismo e Hotelaria",
    niches: [
      "Hotéis",
      "Pousadas",
      "Hostels",
      "Agências de Viagem",
      "Guias Turísticos",
      "Aluguel de Carros",
      "Traslados",
      "Parques Aquáticos",
      "Camping"
    ]
  },
  {
    category: "Agricultura e Pecuária",
    niches: [
      "Agropecuárias",
      "Veterinárias",
      "Ração Animal",
      "Insumos Agrícolas",
      "Tratores",
      "Irrigação",
      "Fazendas",
      "Viveiros de Plantas"
    ]
  },
  {
    category: "Transportes e Logística",
    niches: [
      "Transportadoras",
      "Motoboys",
      "Uber/Taxi",
      "Mudanças",
      "Estacionamentos",
      "Auto Escolas",
      "Despachantes",
      "Entregas Rápidas"
    ]
  },
  {
    category: "Móveis e Decoração",
    niches: [
      "Lojas de Móveis",
      "Design de Interiores",
      "Cortinas e Persianas",
      "Tapetes",
      "Quadros e Molduras",
      "Iluminação",
      "Paisagismo",
      "Colchões"
    ]
  },
  {
    category: "Esportes",
    niches: [
      "Lojas de Esportes",
      "Quadras Esportivas",
      "Personal Trainers",
      "Clubes Esportivos",
      "Piscinas",
      "Surf Shops",
      "Bike Shops",
      "Artigos de Pesca"
    ]
  }
];

export const QUICK_LOCATIONS: LocationRegion[] = [
  {
    region: "Sudeste",
    locations: [
      { city: "São Paulo", state: "SP", country: "Brasil" },
      { city: "Rio de Janeiro", state: "RJ", country: "Brasil" },
      { city: "Belo Horizonte", state: "MG", country: "Brasil" },
      { city: "Campinas", state: "SP", country: "Brasil" },
      { city: "Santos", state: "SP", country: "Brasil" },
      { city: "Guarulhos", state: "SP", country: "Brasil" },
      { city: "Vitória", state: "ES", country: "Brasil" },
      { city: "Niterói", state: "RJ", country: "Brasil" },
      { city: "Uberlândia", state: "MG", country: "Brasil" },
      { city: "São Bernardo do Campo", state: "SP", country: "Brasil" },
      { city: "Santo André", state: "SP", country: "Brasil" },
      { city: "Osasco", state: "SP", country: "Brasil" },
      { city: "Sorocaba", state: "SP", country: "Brasil" },
      { city: "Ribeirão Preto", state: "SP", country: "Brasil" },
      { city: "São José dos Campos", state: "SP", country: "Brasil" },
      { city: "Juiz de Fora", state: "MG", country: "Brasil" },
      { city: "Contagem", state: "MG", country: "Brasil" },
      { city: "Campos dos Goytacazes", state: "RJ", country: "Brasil" },
      { city: "Nova Iguaçu", state: "RJ", country: "Brasil" },
      { city: "Duque de Caxias", state: "RJ", country: "Brasil" },
      { city: "Vila Velha", state: "ES", country: "Brasil" },
      { city: "Serra", state: "ES", country: "Brasil" },
      { city: "Bauru", state: "SP", country: "Brasil" },
      { city: "Piracicaba", state: "SP", country: "Brasil" },
      { city: "Jundiaí", state: "SP", country: "Brasil" },
      { city: "Franca", state: "SP", country: "Brasil" },
      { city: "Petrópolis", state: "RJ", country: "Brasil" },
      { city: "Volta Redonda", state: "RJ", country: "Brasil" },
      { city: "Betim", state: "MG", country: "Brasil" },
      { city: "Montes Claros", state: "MG", country: "Brasil" }
    ]
  },
  {
    region: "Sul",
    locations: [
      { city: "Curitiba", state: "PR", country: "Brasil" },
      { city: "Porto Alegre", state: "RS", country: "Brasil" },
      { city: "Florianópolis", state: "SC", country: "Brasil" },
      { city: "Joinville", state: "SC", country: "Brasil" },
      { city: "Londrina", state: "PR", country: "Brasil" },
      { city: "Caxias do Sul", state: "RS", country: "Brasil" },
      { city: "Maringá", state: "PR", country: "Brasil" },
      { city: "Ponta Grossa", state: "PR", country: "Brasil" },
      { city: "Cascavel", state: "PR", country: "Brasil" },
      { city: "Foz do Iguaçu", state: "PR", country: "Brasil" },
      { city: "Pelotas", state: "RS", country: "Brasil" },
      { city: "Canoas", state: "RS", country: "Brasil" },
      { city: "Santa Maria", state: "RS", country: "Brasil" },
      { city: "Blumenau", state: "SC", country: "Brasil" },
      { city: "Chapecó", state: "SC", country: "Brasil" },
      { city: "Criciúma", state: "SC", country: "Brasil" },
      { city: "Itajaí", state: "SC", country: "Brasil" },
      { city: "São José dos Pinhais", state: "PR", country: "Brasil" },
      { city: "Passo Fundo", state: "RS", country: "Brasil" },
      { city: "Rio Grande", state: "RS", country: "Brasil" },
      { city: "Balneário Camboriú", state: "SC", country: "Brasil" }
    ]
  },
  {
    region: "Centro-Oeste",
    locations: [
      { city: "Brasília", state: "DF", country: "Brasil" },
      { city: "Goiânia", state: "GO", country: "Brasil" },
      { city: "Campo Grande", state: "MS", country: "Brasil" },
      { city: "Cuiabá", state: "MT", country: "Brasil" },
      { city: "Aparecida de Goiânia", state: "GO", country: "Brasil" },
      { city: "Anápolis", state: "GO", country: "Brasil" },
      { city: "Dourados", state: "MS", country: "Brasil" },
      { city: "Rondonópolis", state: "MT", country: "Brasil" },
      { city: "Várzea Grande", state: "MT", country: "Brasil" },
      { city: "Sinop", state: "MT", country: "Brasil" },
      { city: "Rio Verde", state: "GO", country: "Brasil" },
      { city: "Três Lagoas", state: "MS", country: "Brasil" }
    ]
  },
  {
    region: "Nordeste",
    locations: [
      { city: "Salvador", state: "BA", country: "Brasil" },
      { city: "Recife", state: "PE", country: "Brasil" },
      { city: "Fortaleza", state: "CE", country: "Brasil" },
      { city: "Natal", state: "RN", country: "Brasil" },
      { city: "Maceió", state: "AL", country: "Brasil" },
      { city: "São Luís", state: "MA", country: "Brasil" },
      { city: "João Pessoa", state: "PB", country: "Brasil" },
      { city: "Aracaju", state: "SE", country: "Brasil" },
      { city: "Teresina", state: "PI", country: "Brasil" },
      { city: "Feira de Santana", state: "BA", country: "Brasil" },
      { city: "Vitória da Conquista", state: "BA", country: "Brasil" },
      { city: "Camaçari", state: "BA", country: "Brasil" },
      { city: "Jaboatão dos Guararapes", state: "PE", country: "Brasil" },
      { city: "Olinda", state: "PE", country: "Brasil" },
      { city: "Petrolina", state: "PE", country: "Brasil" },
      { city: "Caucaia", state: "CE", country: "Brasil" },
      { city: "Juazeiro do Norte", state: "CE", country: "Brasil" },
      { city: "Campina Grande", state: "PB", country: "Brasil" },
      { city: "Mossoró", state: "RN", country: "Brasil" },
      { city: "Imperatriz", state: "MA", country: "Brasil" },
      { city: "Caruaru", state: "PE", country: "Brasil" },
      { city: "Ilhéus", state: "BA", country: "Brasil" },
      { city: "Itabuna", state: "BA", country: "Brasil" },
      { city: "Sobral", state: "CE", country: "Brasil" }
    ]
  },
  {
    region: "Norte",
    locations: [
      { city: "Manaus", state: "AM", country: "Brasil" },
      { city: "Belém", state: "PA", country: "Brasil" },
      { city: "Porto Velho", state: "RO", country: "Brasil" },
      { city: "Palmas", state: "TO", country: "Brasil" },
      { city: "Macapá", state: "AP", country: "Brasil" },
      { city: "Boa Vista", state: "RR", country: "Brasil" },
      { city: "Rio Branco", state: "AC", country: "Brasil" },
      { city: "Santarém", state: "PA", country: "Brasil" },
      { city: "Ananindeua", state: "PA", country: "Brasil" },
      { city: "Marabá", state: "PA", country: "Brasil" },
      { city: "Araguaína", state: "TO", country: "Brasil" },
      { city: "Parauapebas", state: "PA", country: "Brasil" },
      { city: "Ji-Paraná", state: "RO", country: "Brasil" }
    ]
  }
];
