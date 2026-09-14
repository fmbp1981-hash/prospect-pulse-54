import * as z from "zod";

// Novo Pipeline: 7 Estágios
export const leadEditSchema = z.object({
  empresa: z.string().min(1, "Nome da empresa é obrigatório"),
  status: z.enum([
    // Pipeline Principal (7 estágios)
    "Novo Lead",
    "Contato Inicial",
    "Qualificação",
    "Transferido para Consultor",
    "Fechado Ganho",
    "Fechado Perdido",
    "Follow-up",
    // Deprecated (para retrocompatibilidade com dados antigos)
    "Proposta Enviada",
    "Negociação",
    "Fechado",
    "Em Follow-up",
    "Novo",
  ] as const),
  contato: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  website: z.string().url("URL inválida").optional().or(z.literal("")),
  instagram: z.string().optional(),
  linkedin: z.string().optional(),
  cidade: z.string().optional(),
  endereco: z.string().optional(),
  bairro: z.string().optional(),
  categoria: z.string().optional(),
  cnpj: z.string().optional(),
  aceitaCartao: z.string().optional(),
  telefone: z.string().optional(),
  resumo_analitico: z.string().optional(),
});

export type LeadEditFormData = z.infer<typeof leadEditSchema>;
