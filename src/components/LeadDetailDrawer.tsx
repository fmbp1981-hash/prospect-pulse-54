import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Phone, Mail, MapPin, Building2, Tag, Calendar, History, StickyNote, Send, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadEditModal } from "@/components/LeadEditModal";
import { useLeadDetails } from "@/hooks/useLeadDetails";
import type { Lead } from "@/types/prospection";

interface LeadDetailDrawerProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function LeadDetailDrawer({ lead, open, onClose, onUpdate }: LeadDetailDrawerProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newTag, setNewTag] = useState("");

  const { notes, interactions, tags, isLoading, addNote, addTag, removeTag } = useLeadDetails(lead?.id);

  if (!lead) return null;

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    if (onUpdate) {
      onUpdate();
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await addNote(newNote);
    setNewNote("");
  };

  const handleAddTag = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim()) {
      await addTag(newTag.trim());
      setNewTag("");
    }
  };

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
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l shadow-elevated z-50 flex flex-col"
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1, transition: { duration: 0.26, ease: "easeOut" } }}
            exit={{ x: 320, opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
          >
            {/* Header */}
            <div className="flex-none bg-card border-b px-6 py-4 flex items-center justify-between">
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
            <div className="flex-1 overflow-y-auto">
              <Tabs defaultValue="details" className="w-full h-full flex flex-col">
                <div className="px-6 pt-4">
                  <TabsList className="w-full grid grid-cols-3">
                    <TabsTrigger value="details">Detalhes</TabsTrigger>
                    <TabsTrigger value="history">Histórico</TabsTrigger>
                    <TabsTrigger value="notes">Anotações</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="details" className="flex-1 p-6 space-y-6 outline-none">
                  {/* Status Badge */}
                  <div className="flex gap-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                      {lead.status}
                    </Badge>
                    <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
                      {lead.origem}
                    </Badge>
                  </div>

                  {/* Tags Section */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1">
                          {tag}
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-destructive"
                            onClick={() => removeTag(tag)}
                          />
                        </Badge>
                      ))}
                      <div className="relative flex items-center">
                        <Plus className="absolute left-2 h-3 w-3 text-muted-foreground" />
                        <Input
                          className="h-6 w-24 pl-6 text-xs"
                          placeholder="Nova tag..."
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={handleAddTag}
                        />
                      </div>
                    </div>
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
                  </div>
                </TabsContent>

                <TabsContent value="history" className="flex-1 p-6 space-y-6 outline-none">
                  <div className="space-y-6">
                    {interactions.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        Nenhuma interação registrada
                      </div>
                    ) : (
                      interactions.map((interaction) => (
                        <div key={interaction.id} className="flex gap-4 relative pb-6 last:pb-0">
                          <div className="absolute left-[19px] top-8 bottom-0 w-px bg-border last:hidden" />
                          <div className="relative z-10 h-10 w-10 shrink-0 rounded-full bg-muted flex items-center justify-center border">
                            {interaction.type === 'status_change' ? <History className="h-4 w-4" /> :
                              interaction.type === 'whatsapp_sent' ? <Send className="h-4 w-4" /> :
                                interaction.type === 'note_added' ? <StickyNote className="h-4 w-4" /> :
                                  <Calendar className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 pt-1">
                            <p className="text-sm font-medium">{interaction.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(interaction.created_at).toLocaleString('pt-BR')}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="notes" className="flex-1 p-6 space-y-6 outline-none">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Adicionar uma anotação..."
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        className="min-h-[100px]"
                      />
                      <Button onClick={handleAddNote} disabled={!newNote.trim()} className="w-full">
                        Adicionar Nota
                      </Button>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      {notes.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                          Nenhuma anotação encontrada
                        </div>
                      ) : (
                        notes.map((note) => (
                          <div key={note.id} className="bg-muted/30 p-4 rounded-lg space-y-2">
                            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                            <p className="text-xs text-muted-foreground text-right">
                              {new Date(note.created_at).toLocaleString('pt-BR')}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Footer Actions */}
            <div className="flex-none bg-card border-t px-6 py-4 flex gap-2">
              <Button className="flex-1" variant="outline" onClick={onClose}>
                Fechar
              </Button>
              <Button
                className="flex-1 gradient-primary text-white"
                onClick={() => setIsEditModalOpen(true)}
              >
                Editar Lead
              </Button>
            </div>
          </motion.div>

          {/* Edit Modal */}
          <LeadEditModal
            lead={lead}
            open={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onSuccess={handleEditSuccess}
          />
        </>
      )}
    </AnimatePresence>
  );
}
