import { useState, useEffect, useMemo } from "react";
import { n8nMcp } from "@/lib/n8nMcp";
import { Lead, LeadStatus, LeadOrigin, LeadPriority } from "@/types/prospection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, RefreshCw, ArrowUpDown, Edit, MessageCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { LeadsFilters } from "@/components/leads/LeadsFilters";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type SortField = keyof Lead;
type SortOrder = 'asc' | 'desc';

const LeadsTable = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [originFilter, setOriginFilter] = useState<LeadOrigin | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<LeadPriority | "all">("all");
  const [regionFilter, setRegionFilter] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  
  // Ordenação
  const [sortField, setSortField] = useState<SortField>("dataContato");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const loadLeads = async () => {
    setIsLoading(true);
    const result = await n8nMcp.syncAllLeads();
    
    if (result.success) {
      setLeads(result.leads);
      toast.success("Leads carregados com sucesso!");
    } else {
      toast.error("Erro ao carregar leads", {
        description: result.message || "Verifique a configuração do webhook",
      });
    }
    setIsLoading(false);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    await loadLeads();
    setIsSyncing(false);
  };

  useEffect(() => {
    loadLeads();
  }, []);

  // Filtrar e ordenar leads
  const filteredAndSortedLeads = useMemo(() => {
    let filtered = leads;

    // Busca full-text
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(lead => 
        lead.lead.toLowerCase().includes(term) ||
        lead.empresa.toLowerCase().includes(term) ||
        lead.whatsapp.includes(term) ||
        lead.contatoPrincipal.toLowerCase().includes(term) ||
        lead.segmento.toLowerCase().includes(term) ||
        lead.regiao.toLowerCase().includes(term) ||
        (lead.observacoes?.toLowerCase().includes(term) || false)
      );
    }

    // Filtros específicos
    if (statusFilter !== "all") {
      filtered = filtered.filter(lead => lead.status === statusFilter);
    }
    if (originFilter !== "all") {
      filtered = filtered.filter(lead => lead.origem === originFilter);
    }
    if (priorityFilter !== "all") {
      filtered = filtered.filter(lead => lead.prioridade === priorityFilter);
    }
    if (regionFilter) {
      filtered = filtered.filter(lead => lead.regiao.toLowerCase().includes(regionFilter.toLowerCase()));
    }
    if (segmentFilter) {
      filtered = filtered.filter(lead => lead.segmento.toLowerCase().includes(segmentFilter.toLowerCase()));
    }

    // Ordenação
    filtered.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (aValue === undefined) return 1;
      if (bValue === undefined) return -1;
      
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [leads, searchTerm, statusFilter, originFilter, priorityFilter, regionFilter, segmentFilter, sortField, sortOrder]);

  // Paginação
  const totalPages = Math.ceil(filteredAndSortedLeads.length / itemsPerPage);
  const paginatedLeads = filteredAndSortedLeads.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const exportToCSV = () => {
    const headers = ["Lead", "Status", "Empresa", "WhatsApp", "Contato Principal", "Segmento", "Região", "Ticket Médio", "Origem", "Data Contato", "Prioridade"];
    const csvData = filteredAndSortedLeads.map(lead => [
      lead.lead,
      lead.status,
      lead.empresa,
      lead.whatsapp,
      lead.contatoPrincipal,
      lead.segmento,
      lead.regiao,
      lead.ticketMedioEstimado.toString(),
      lead.origem,
      lead.dataContato,
      lead.prioridade,
    ]);
    
    const csv = [
      headers.join(","),
      ...csvData.map(row => row.join(","))
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    toast.success("CSV exportado com sucesso!");
  };

  const getStatusBadgeVariant = (status: LeadStatus) => {
    const variants: Record<LeadStatus, "default" | "secondary" | "destructive" | "outline"> = {
      "Novo Lead": "default",
      "Contato Inicial": "secondary",
      "Qualificação": "secondary",
      "Proposta Enviada": "outline",
      "Negociação": "outline",
      "Fechado Ganho": "default",
      "Fechado Perdido": "destructive",
      "Em Follow-up": "secondary",
    };
    return variants[status];
  };

  const getPriorityColor = (priority: LeadPriority) => {
    const colors: Record<LeadPriority, string> = {
      "Alta": "text-red-500",
      "Média": "text-yellow-500",
      "Baixa": "text-green-500",
    };
    return colors[priority];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando leads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header Actions */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">
            {filteredAndSortedLeads.length} de {leads.length} leads
          </h2>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToCSV} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
          <Button onClick={handleSync} variant="outline" size="sm" disabled={isSyncing}>
            {isSyncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Busca e Filtros */}
      <div className="mb-6 space-y-4">
        {/* Busca Full-Text */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, empresa, telefone, segmento, região..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filtros Avançados */}
        <LeadsFilters
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          originFilter={originFilter}
          setOriginFilter={setOriginFilter}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          regionFilter={regionFilter}
          setRegionFilter={setRegionFilter}
          segmentFilter={segmentFilter}
          setSegmentFilter={setSegmentFilter}
        />
      </div>

      {/* Tabela */}
      <div className="rounded-lg border bg-card shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => handleSort("lead")}>
                <div className="flex items-center gap-2">
                  Lead
                  <ArrowUpDown className="h-4 w-4" />
                </div>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("status")}>
                <div className="flex items-center gap-2">
                  Status
                  <ArrowUpDown className="h-4 w-4" />
                </div>
              </TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Segmento</TableHead>
              <TableHead>Região</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("ticketMedioEstimado")}>
                <div className="flex items-center gap-2">
                  Ticket Médio
                  <ArrowUpDown className="h-4 w-4" />
                </div>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("prioridade")}>
                <div className="flex items-center gap-2">
                  Prioridade
                  <ArrowUpDown className="h-4 w-4" />
                </div>
              </TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Nenhum lead encontrado com os filtros selecionados
                </TableCell>
              </TableRow>
            ) : (
              paginatedLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.lead}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(lead.status)}>
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{lead.empresa}</TableCell>
                  <TableCell className="font-mono text-sm">{lead.whatsapp}</TableCell>
                  <TableCell>{lead.segmento}</TableCell>
                  <TableCell>{lead.regiao}</TableCell>
                  <TableCell>
                    R$ {lead.ticketMedioEstimado.toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell>
                    <span className={getPriorityColor(lead.prioridade)}>
                      {lead.prioridade}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => setCurrentPage(pageNum)}
                      isActive={currentPage === pageNum}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              
              {totalPages > 5 && currentPage < totalPages - 2 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
              
              <PaginationItem>
                <PaginationNext
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
};

export default LeadsTable;
