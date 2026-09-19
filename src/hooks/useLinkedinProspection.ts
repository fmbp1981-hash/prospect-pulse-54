import { useState } from "react";
import { toast } from "sonner";
import {
  LinkedinSearchBy,
  LinkedinSearchContact,
  LinkedinSearchSummary,
  LocationData,
} from "@/types/prospection";

export const LINKEDIN_SEARCH_BY_LABELS: Record<LinkedinSearchBy, { label: string; placeholder: string }> = {
  pessoa: { label: "Nome da Pessoa", placeholder: "Ex: João Silva, Maria Souza..." },
  empresa: { label: "Nome da Empresa", placeholder: "Ex: Nubank, Magazine Luiza..." },
  cargo: { label: "Cargo", placeholder: "Ex: Marketing Manager, Diretor Financeiro..." },
};

const EMPTY_LOCATION: LocationData = { country: "", state: "", city: "", neighborhood: "" };

interface LinkedinSearchParams {
  searchQuery: string;
  location: LocationData;
  jobTitles: string;
  companies: string;
  industryIds: number[];
  maxItems: number;
}

function toList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

// Converte a seleção país/estado/cidade num array de termos de localização
// para o filtro do Apify (ex: ["São Paulo", "São Paulo", "Brasil"]).
function locationToList(location: LocationData): string[] {
  return [location.city, location.state, location.country].filter((v): v is string => Boolean(v?.trim()));
}

export interface UseLinkedinProspectionOptions {
  onSearchCompleted?: (params: LinkedinSearchParams, summary: LinkedinSearchSummary) => void;
}

/**
 * Encapsula estado e chamadas de API da prospecção LinkedIn (busca de
 * pessoas, enriquecimento de contato e promoção para o CRM). Mantém
 * ProspectionForm.tsx só com apresentação, conforme camadas IntelliX
 * (component -> hook -> API route -> service -> repository -> Supabase).
 */
export function useLinkedinProspection(options?: UseLinkedinProspectionOptions) {
  const [searchBy, setSearchBy] = useState<LinkedinSearchBy>("pessoa");
  const [searchQuery, setSearchQuery] = useState("");
  const [location, setLocation] = useState<LocationData>(EMPTY_LOCATION);
  const [jobTitles, setJobTitles] = useState("");
  const [companies, setCompanies] = useState("");
  const [industryIds, setIndustryIds] = useState<number[]>([]);
  const [maxItems, setMaxItems] = useState(20);
  const [findEmail, setFindEmail] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<LinkedinSearchSummary | null>(null);
  const [enrichingContactId, setEnrichingContactId] = useState<string | null>(null);
  const [promotingContactId, setPromotingContactId] = useState<string | null>(null);

  const search = async () => {
    if (!searchQuery.trim()) {
      const fieldLabel = searchBy === "empresa" ? "o nome da empresa" : searchBy === "cargo" ? "o cargo" : "o nome da pessoa";
      toast.error("Campo obrigatório vazio", { description: `Informe ${fieldLabel} que deseja buscar.` });
      return;
    }

    setIsSearching(true);
    setResult(null);

    const loadingToast = toast.loading("Buscando no LinkedIn...", {
      description: `Buscando até ${maxItems} perfis...`,
      duration: Infinity,
    });

    try {
      const res = await fetch("/api/prospecting/linkedin/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchQuery,
          locations: locationToList(location),
          // currentJobTitles é o filtro nativo "Current title" do próprio
          // LinkedIn (via actor Apify) — na prática exige que as palavras da
          // frase apareçam no título atual do perfil, o que quase nunca bate
          // com frases longas em português ("Gerente Regional Comercial" vs.
          // "Gerente Comercial Regional", "Gerente de Vendas Regional" etc.)
          // e pode zerar os resultados. Por isso NÃO usamos o texto do modo
          // "cargo" aqui — a precisão desse modo é garantida no backend por
          // filtro de relevância próprio (ver titleFilterQuery abaixo e
          // linkedin-prospecting.service.ts), não pelo filtro opaco do ator.
          currentJobTitles: toList(jobTitles),
          currentCompanies: toList(companies),
          industryIds: industryIds.length > 0 ? industryIds : undefined,
          // Usado só no backend para filtrar por relevância os resultados do
          // modo "cargo" (não é enviado ao Apify).
          titleFilterQuery: searchBy === "cargo" ? searchQuery : undefined,
          maxItems,
          findEmail,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(typeof json.error === "string" ? json.error : "Erro ao buscar no LinkedIn", { id: loadingToast });
        return;
      }

      const summary = json.data as LinkedinSearchSummary;
      setResult(summary);
      if (summary.parsingBroken) {
        // Apify achou perfis, mas o formato de saída do actor mudou e nosso
        // parser descartou todos — não é "ninguém encontrado", é um bug
        // nosso de compatibilidade que precisa de correção no código.
        toast.error(
          "O Apify encontrou perfis, mas o formato de resposta do conector mudou e nada pôde ser lido — isso é um problema técnico nosso, não falta de resultados. Avise o suporte.",
          { id: loadingToast, duration: 8000 }
        );
      } else {
        const mismatchNote = summary.skippedTitleMismatch > 0
          ? `, ${summary.skippedTitleMismatch} descartados por cargo divergente`
          : "";
        toast.success(
          `${summary.found} perfis encontrados — ${summary.created} novos, ${summary.skippedDuplicate} já existiam${mismatchNote}`,
          { id: loadingToast, duration: 5000 }
        );
      }

      options?.onSearchCompleted?.({ searchQuery, location, jobTitles, companies, industryIds, maxItems }, summary);
      setSearchQuery("");
    } catch {
      toast.error("Erro ao conectar com a API de prospecção", { id: loadingToast });
    } finally {
      setIsSearching(false);
    }
  };

  const updateContact = (id: string, patch: Partial<LinkedinSearchContact>) => {
    setResult((prev) =>
      prev ? { ...prev, contacts: prev.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : prev
    );
  };

  const enrichContact = async (contact: LinkedinSearchContact) => {
    setEnrichingContactId(contact.id);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/enrich`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(typeof json.error === "string" ? json.error : "Erro ao enriquecer contato");
        return;
      }
      const data = json.data as { contact: { email: string | null; phone: string | null }; emailFound: boolean; phoneFound: boolean };
      updateContact(contact.id, { email: data.contact.email, phone: data.contact.phone });
      if (data.emailFound || data.phoneFound) {
        toast.success("Contato enriquecido com dados do site institucional");
      } else {
        toast.info("Não encontramos email/telefone públicos no site da empresa");
      }
    } catch {
      toast.error("Erro ao conectar com a API de enriquecimento");
    } finally {
      setEnrichingContactId(null);
    }
  };

  const promoteContact = async (contact: LinkedinSearchContact) => {
    setPromotingContactId(contact.id);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/promote`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(typeof json.error === "string" ? json.error : "Erro ao enviar para o CRM");
        return;
      }
      const lead = json.data as { id: string };
      updateContact(contact.id, { convertedLeadId: lead.id });
      toast.success('Lead criado na Tabela de Leads — origem "LinkedIn"');
    } catch {
      toast.error("Erro ao conectar com a API de conversão");
    } finally {
      setPromotingContactId(null);
    }
  };

  return {
    searchBy,
    setSearchBy,
    searchQuery,
    setSearchQuery,
    location,
    setLocation,
    jobTitles,
    setJobTitles,
    companies,
    setCompanies,
    industryIds,
    setIndustryIds,
    maxItems,
    setMaxItems,
    findEmail,
    setFindEmail,
    isSearching,
    result,
    enrichingContactId,
    promotingContactId,
    search,
    enrichContact,
    promoteContact,
  };
}
