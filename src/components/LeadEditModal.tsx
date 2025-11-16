import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Lead, LeadStatus, LeadPriority, WhatsAppStatus } from "@/types/prospection";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const leadEditSchema = z.object({
  empresa: z.string().min(1, "Nome da empresa é obrigatório"),
  status: z.enum([
    "Novo Lead",
    "Contato Inicial",
    "Qualificação",
    "Proposta Enviada",
    "Negociação",
    "Fechado Ganho",
    "Fechado Perdido",
    "Em Follow-up",
  ] as const),
  contato: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  website: z.string().url("URL inválida").optional().or(z.literal("")),
  instagram: z.string().optional(),
  cidade: z.string().optional(),
  endereco: z.string().optional(),
  categoria: z.string().optional(),
  cnpj: z.string().optional(),
  aceitaCartao: z.string().optional(),
});

type LeadEditFormData = z.infer<typeof leadEditSchema>;

interface LeadEditModalProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LeadEditModal({ lead, open, onClose, onSuccess }: LeadEditModalProps) {
  const form = useForm<LeadEditFormData>({
    resolver: zodResolver(leadEditSchema),
    defaultValues: {
      empresa: lead?.empresa || "",
      status: lead?.status || "Novo Lead",
      contato: lead?.contato || "",
      whatsapp: lead?.whatsapp || "",
      email: lead?.email || "",
      website: lead?.website || "",
      instagram: lead?.instagram || "",
      cidade: lead?.cidade || "",
      endereco: lead?.endereco || "",
      categoria: lead?.categoria || "",
      cnpj: lead?.cnpj || "",
      aceitaCartao: lead?.aceitaCartao || "",
    },
  });

  // Reset form when lead changes
  if (lead && open) {
    form.reset({
      empresa: lead.empresa || "",
      status: lead.status || "Novo Lead",
      contato: lead.contato || "",
      whatsapp: lead.whatsapp || "",
      email: lead.email || "",
      website: lead.website || "",
      instagram: lead.instagram || "",
      cidade: lead.cidade || "",
      endereco: lead.endereco || "",
      categoria: lead.categoria || "",
      cnpj: lead.cnpj || "",
      aceitaCartao: lead.aceitaCartao || "",
    });
  }

  const onSubmit = async (data: LeadEditFormData) => {
    if (!lead) return;

    try {
      // Mapear campos do formulário para os campos do banco de dados
      const updateData: any = {
        empresa: data.empresa,
        status: data.status,
        contato: data.contato || null,
        telefone_whatsapp: data.whatsapp || null,
        email: data.email || null,
        website: data.website || null,
        instagram: data.instagram || null,
        cidade: data.cidade || null,
        endereco: data.endereco || null,
        categoria: data.categoria || null,
        cnpj: data.cnpj || null,
        aceita_cartao: data.aceitaCartao || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('leads_prospeccao')
        .update(updateData)
        .eq('id', lead.id);

      if (error) throw error;

      toast.success("Lead atualizado com sucesso!", {
        description: `${data.empresa} foi atualizado.`,
      });

      form.reset();
      onClose();

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Erro ao atualizar lead:", error);
      toast.error("Erro ao atualizar lead", {
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };

  if (!lead) return null;

  const statuses: LeadStatus[] = [
    "Novo Lead",
    "Contato Inicial",
    "Qualificação",
    "Proposta Enviada",
    "Negociação",
    "Fechado Ganho",
    "Fechado Perdido",
    "Em Follow-up",
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Lead - {lead.lead}</DialogTitle>
          <DialogDescription>
            Atualize as informações do lead {lead.empresa}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Empresa e Status */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="empresa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Empresa *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome da empresa" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Contato e WhatsApp */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contato"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contato Principal</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome do contato" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="whatsapp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp</FormLabel>
                    <FormControl>
                      <Input placeholder="+55 81 99999-9999" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Email e Website */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@empresa.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input placeholder="https://empresa.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Instagram e Categoria */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="instagram"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instagram</FormLabel>
                    <FormControl>
                      <Input placeholder="@empresa" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categoria"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria/Nicho</FormLabel>
                    <FormControl>
                      <Input placeholder="Restaurante, Pizzaria, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Cidade e Endereço */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input placeholder="São Paulo, SP" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl>
                      <Input placeholder="00.000.000/0000-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Endereço Completo */}
            <FormField
              control={form.control}
              name="endereco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endereço Completo</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Rua, número, bairro, cidade - estado"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Aceita Cartão */}
            <FormField
              control={form.control}
              name="aceitaCartao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aceita Cartão</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Sim">Sim</SelectItem>
                      <SelectItem value="Não">Não</SelectItem>
                      <SelectItem value="Não informado">Não informado</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={form.formState.isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="gradient-primary text-white"
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Alterações"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
