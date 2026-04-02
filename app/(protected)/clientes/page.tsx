'use client';

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users, Search, MoreVertical, Clock, Phone, Mail, Building2, RotateCcw, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface Cliente {
  id: string;
  empresa: string;
  contato: string | null;
  whatsapp: string | null;
  email: string | null;
  cidade: string | null;
  categoria: string | null;
  status: string;
  data_conversao: string;
  origem: string | null;
}

interface HistoricoItem {
  id: string;
  tipo: string;
  descricao: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  Ativo: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Inativo: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  Reprospectar: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const TIPO_ICONS: Record<string, string> = {
  conversao: "🎯",
  whatsapp_enviado: "📤",
  whatsapp_recebido: "📥",
  qualificacao: "✅",
  transferencia: "🔀",
  campanha_email: "📧",
  campanha_whatsapp: "📱",
  follow_up: "🔁",
  nota: "📝",
  status_change: "🔄",
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLoadingHistorico, setIsLoadingHistorico] = useState(false);
  const [isDevolving, setIsDevolving] = useState(false);

  const loadClientes = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      const res = await fetch(`/api/clientes?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setClientes(json.clientes ?? []);
    } catch (err) {
      toast.error("Erro ao carregar clientes", { description: String(err) });
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadClientes();
  }, [loadClientes]);

  const openDetail = async (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setIsDetailOpen(true);
    setIsLoadingHistorico(true);
    try {
      const res = await fetch(`/api/clientes/${cliente.id}`);
      const json = await res.json();
      setHistorico(json.historico ?? []);
    } catch {
      setHistorico([]);
    } finally {
      setIsLoadingHistorico(false);
    }
  };

  const handleDevolver = async (cliente: Cliente) => {
    if (!confirm(`Devolver "${cliente.empresa}" para o funil de leads?`)) return;
    setIsDevolving(true);
    try {
      const res = await fetch(`/api/clientes/${cliente.id}/devolver`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(`${cliente.empresa} devolvido para prospecção`);
      setIsDetailOpen(false);
      loadClientes();
    } catch (err) {
      toast.error("Erro ao devolver cliente", { description: String(err) });
    } finally {
      setIsDevolving(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Base de Clientes</h1>
            <p className="text-muted-foreground text-sm">
              {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} · repositório permanente
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadClientes} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por empresa, contato, WhatsApp..."
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadClientes()}
        />
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Convertido em</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    Carregando clientes...
                  </TableCell>
                </TableRow>
              ) : clientes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    Nenhum cliente encontrado. Clientes aparecem aqui quando um lead é convertido.
                  </TableCell>
                </TableRow>
              ) : clientes.map((c, i) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => openDetail(c)}
                >
                  <TableCell className="font-medium">{c.empresa}</TableCell>
                  <TableCell>{c.contato ?? '—'}</TableCell>
                  <TableCell>
                    {c.whatsapp ? (
                      <span className="flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {c.whatsapp}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell>{c.cidade ?? '—'}</TableCell>
                  <TableCell>
                    {c.categoria ? (
                      <Badge variant="outline" className="text-xs">{c.categoria}</Badge>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${STATUS_COLORS[c.status] ?? ''}`}>
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(c.data_conversao)}
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDetail(c)}>
                          Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-amber-600"
                          onClick={() => handleDevolver(c)}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Devolver para leads
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de detalhes */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {selectedCliente?.empresa}
              <Badge className={`ml-2 text-xs ${STATUS_COLORS[selectedCliente?.status ?? ''] ?? ''}`}>
                {selectedCliente?.status}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {selectedCliente && (
            <div className="flex flex-col gap-4 overflow-y-auto flex-1 pr-1">
              {/* Dados */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {selectedCliente.contato && (
                  <div>
                    <span className="text-muted-foreground">Contato</span>
                    <p className="font-medium">{selectedCliente.contato}</p>
                  </div>
                )}
                {selectedCliente.whatsapp && (
                  <div>
                    <span className="text-muted-foreground">WhatsApp</span>
                    <p className="font-medium flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedCliente.whatsapp}
                    </p>
                  </div>
                )}
                {selectedCliente.email && (
                  <div>
                    <span className="text-muted-foreground">Email</span>
                    <p className="font-medium flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {selectedCliente.email}
                    </p>
                  </div>
                )}
                {selectedCliente.cidade && (
                  <div>
                    <span className="text-muted-foreground">Cidade</span>
                    <p className="font-medium">{selectedCliente.cidade}</p>
                  </div>
                )}
                {selectedCliente.categoria && (
                  <div>
                    <span className="text-muted-foreground">Categoria</span>
                    <p className="font-medium">{selectedCliente.categoria}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Origem</span>
                  <p className="font-medium">{selectedCliente.origem ?? '—'}</p>
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Histórico
                </h3>
                {isLoadingHistorico ? (
                  <p className="text-sm text-muted-foreground">Carregando histórico...</p>
                ) : historico.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem histórico registrado.</p>
                ) : (
                  <div className="space-y-3">
                    {historico.map(h => (
                      <div key={h.id} className="flex gap-3">
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                          {TIPO_ICONS[h.tipo] ?? '📌'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{h.descricao}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(h.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="border-t pt-4">
            <Button
              variant="outline"
              className="text-amber-600 border-amber-300 hover:bg-amber-50"
              disabled={isDevolving}
              onClick={() => selectedCliente && handleDevolver(selectedCliente)}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {isDevolving ? 'Devolvendo...' : 'Devolver para leads'}
            </Button>
            <Button variant="ghost" onClick={() => setIsDetailOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
