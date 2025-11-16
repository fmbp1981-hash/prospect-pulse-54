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
      "Food Trucks"
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
      "Laboratórios"
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
      "Depilação"
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
      "Papelarias"
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
      "Chaveiros"
    ]
  },
  {
    category: "Construção",
    niches: [
      "Construtoras",
      "Arquitetura",
      "Marcenarias",
      "Serralheria",
      "Material de Construção",
      "Pintores",
      "Vidraçarias",
      "Marmorarias"
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
      "Borracharias"
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
      "Escolas de Informática"
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
      "Buffets",
      "Parques de Diversão",
      "Escape Rooms",
      "Boliches",
      "Fliperamas",
      "Casas de Eventos"
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
      "Parques Aquáticos"
    ]
  },
  {
    category: "Tecnologia",
    niches: [
      "Assistência Técnica Informática",
      "Lojas de Informática",
      "Desenvolvimento de Software",
      "Coworking",
      "Impressoras 3D",
      "Drones",
      "Robótica",
      "Assistência Celulares"
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
      "Fazendas"
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
      "Despachantes"
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
      "Jardins"
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
      "Bike Shops"
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
      { city: "Serra", state: "ES", country: "Brasil" }
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
      { city: "Itajaí", state: "SC", country: "Brasil" }
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
      { city: "Várzea Grande", state: "MT", country: "Brasil" }
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
      { city: "Imperatriz", state: "MA", country: "Brasil" }
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
      { city: "Araguaína", state: "TO", country: "Brasil" }
    ]
  }
];
