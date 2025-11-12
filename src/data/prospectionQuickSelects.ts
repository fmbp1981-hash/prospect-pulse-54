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
      "Reforço Escolar"
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
      { city: "Uberlândia", state: "MG", country: "Brasil" }
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
      { city: "Caxias do Sul", state: "RS", country: "Brasil" }
    ]
  },
  {
    region: "Centro-Oeste",
    locations: [
      { city: "Brasília", state: "DF", country: "Brasil" },
      { city: "Goiânia", state: "GO", country: "Brasil" },
      { city: "Campo Grande", state: "MS", country: "Brasil" },
      { city: "Cuiabá", state: "MT", country: "Brasil" }
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
      { city: "Aracaju", state: "SE", country: "Brasil" }
    ]
  },
  {
    region: "Norte",
    locations: [
      { city: "Manaus", state: "AM", country: "Brasil" },
      { city: "Belém", state: "PA", country: "Brasil" },
      { city: "Porto Velho", state: "RO", country: "Brasil" },
      { city: "Palmas", state: "TO", country: "Brasil" }
    ]
  }
];
