import { motion, AnimatePresence } from "framer-motion";
import { X, Phone, Mail, MapPin, Building2, Tag, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Lead } from "@/types/prospection";

interface LeadDetailDrawerProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}

export function LeadDetailDrawer({ lead, open, onClose }: LeadDetailDrawerProps) {
  if (!lead) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18 } }}
            exit={{ opacity: 0, transition: { duration: 0.16 } }}
            onClick={onClose}
          />
          
          {/* Drawer Panel */}
          <motion.div
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l shadow-elevated z-50 overflow-y-auto"
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1, transition: { duration: 0.26, ease: "easeOut" } }}
            exit={{ x: 320, opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
          >
            {/* Header */}
            <div className="sticky top-0 bg-card border-b px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">{lead.lead}</h2>
                <p className="text-sm text-muted-foreground">{lead.empresa || "Empresa não informada"}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Status Badge */}
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                  {lead.status}
                </Badge>
                <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
                  {lead.origem}
                </Badge>
              </div>

              <Separator />

              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  Informações de Contato
                </h3>
                
                {lead.whatsapp && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">WhatsApp</p>
                      <a 
                        href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground hover:text-primary transition-smooth"
                      >
                        {lead.whatsapp}
                      </a>
                    </div>
                  </div>
                )}

                {lead.contatoPrincipal && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Contato Principal</p>
                      <p className="text-foreground">{lead.contatoPrincipal}</p>
                    </div>
                  </div>
                )}

                {lead.regiao && (
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-muted-foreground text-xs">Região</p>
                      <p className="text-foreground">{lead.regiao}</p>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Business Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Informações do Negócio
                </h3>

                {lead.segmento && (
                  <div className="flex items-center gap-3 text-sm">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Segmento</p>
                      <p className="text-foreground">{lead.segmento}</p>
                    </div>
                  </div>
                )}

                {lead.prioridade && (
                  <div className="flex items-center gap-3 text-sm">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Prioridade</p>
                      <p className="text-foreground">{lead.prioridade}</p>
                    </div>
                  </div>
                )}

                {lead.ticketMedioEstimado && (
                  <div className="flex items-center gap-3 text-sm">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Ticket Médio Estimado</p>
                      <p className="text-foreground font-medium">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(Number(lead.ticketMedioEstimado) || 0)}
                      </p>
                    </div>
                  </div>
                )}

                {lead.dataContato && (
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Data do Contato</p>
                      <p className="text-foreground">
                        {new Date(lead.dataContato).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                )}

                {lead.proximoFollowUp && (
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Próximo Follow-up</p>
                      <p className="text-foreground">
                        {new Date(lead.proximoFollowUp).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* WhatsApp Status */}
              {lead.statusMsgWA && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Status WhatsApp</h3>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={
                          lead.statusMsgWA === 'sent' ? 'default' : 
                          lead.statusMsgWA === 'failed' ? 'destructive' : 
                          'secondary'
                        }
                      >
                        {lead.statusMsgWA}
                      </Badge>
                      {lead.dataEnvioWA && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(lead.dataEnvioWA).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Observations */}
              {lead.observacoes && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Observações</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {lead.observacoes}
                    </p>
                  </div>
                </>
              )}

              {/* Result */}
              {lead.resultado && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Resultado</h3>
                    <p className="text-sm text-foreground">{lead.resultado}</p>
                  </div>
                </>
              )}
            </div>

            {/* Footer Actions */}
            <div className="sticky bottom-0 bg-card border-t px-6 py-4 flex gap-2">
              <Button className="flex-1" variant="outline" onClick={onClose}>
                Fechar
              </Button>
              <Button className="flex-1 gradient-primary text-white">
                Editar Lead
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
