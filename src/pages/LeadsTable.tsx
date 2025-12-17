import { useState, useEffect, useMemo } from "react";
import { supabaseCRM } from "@/lib/supabaseCRM";
import { Lead, LeadStatus, LeadOrigin, LeadPriority } from "@/types/prospection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, RefreshCw, ArrowUpDown, Edit, MessageCircle, Download, ExternalLink, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import { LeadsFilters } from "@/components/leads/LeadsFilters";
import { toTitleCase } from "@/lib/utils";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { WhatsAppDispatchModal } from "@/components/WhatsAppDispatchModal";
import { ExportModal } from "@/components/ExportModal";
import { LeadEditModal } from "@/components/LeadEditModal";
import { ApplyTemplateModal } from "@/components/ApplyTemplateModal";
import { exportToCSV, exportToExcel } from "@/lib/export";
import { auditExport, auditBulkDelete } from "@/lib/audit";
import { useUserRole } from "@/hooks/useUserRole";
import { RoleGuard } from "@/components/RoleGuard";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
type ViewMode = 'list' | 'kanban';

const LeadsTable = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Permissões e roles
  const { permissions, hasPermission } = useUserRole();

  // Seleção em massa
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isApplyTemplateModalOpen, setIsApplyTemplateModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [hasWhatsAppFilter, setHasWhatsAppFilter] = useState(false);

  // Filtros avançados
  const [whatsappStatusFilter, setWhatsappStatusFilter] = useState<"all" | "not_sent" | "sent" | "failed">("all");
  const [cidadeFilter, setCidadeFilter] = useState("");
  const [bairroFilter, setBairroFilter] = useState("");
  const [dateRangeFilter, setDateRangeFilter] = useState<{ start: string; end: string } | undefined>(undefined);

  // Ordenação
  const [sortField, setSortField] = useState<SortField>("dataContato");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const loadLeads = async () => {
    setIsLoading(true);
    const result = await supabaseCRM.syncAllLeads();

    if (result.success) {
      setLeads(result.leads);
    } else {
      toast.error("Erro ao carregar leads", {
        description: result.message || "Erro ao acessar banco de dados",
      });
    }
    setIsLoading(false);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    await loadLeads();
    setIsSyncing(false);
    toast.success("Leads atualizados!");
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
        (lead.lead || "").toLowerCase().includes(term) ||
        (lead.empresa || "").toLowerCase().includes(term) ||
        (lead.whatsapp || "").toLowerCase().includes(term) ||
        (lead.cidade || "").toLowerCase().includes(term) ||
        (lead.categoria || "").toLowerCase().includes(term) ||
        (lead.endereco || "").toLowerCase().includes(term)
      );
    }

    // Filtros específicos
    if (statusFilter !== "all") {
      filtered = filtered.filter(lead => lead.status === statusFilter);
    }

    if (hasWhatsAppFilter) {
      filtered = filtered.filter(lead => lead.whatsapp && lead.whatsapp.trim() !== "");
    }

    // Filtros avançados
    if (whatsappStatusFilter !== "all") {
      filtered = filtered.filter(lead => lead.statusMsgWA === whatsappStatusFilter);
    }

    if (cidadeFilter && cidadeFilter.trim() !== "") {
      const cidade = cidadeFilter.toLowerCase();
      filtered = filtered.filter(lead =>
        lead.cidade?.toLowerCase().includes(cidade)
      );
    }

    if (bairroFilter && bairroFilter.trim() !== "") {
      const bairro = bairroFilter.toLowerCase();
      filtered = filtered.filter(lead =>
        lead.bairro?.toLowerCase().includes(bairro) ||
        lead.bairroRegiao?.toLowerCase().includes(bairro)
      );
    }

    if (dateRangeFilter?.start || dateRangeFilter?.end) {
      filtered = filtered.filter(lead => {
        if (!lead.data) return false;

        // Converter data do lead para comparação
        const leadDate = new Date(lead.data);

        if (dateRangeFilter.start) {
          const startDate = new Date(dateRangeFilter.start);
          if (leadDate < startDate) return false;
        }

        if (dateRangeFilter.end) {
          const endDate = new Date(dateRangeFilter.end);
          if (leadDate > endDate) return false;
        }

        return true;
      });
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
  }, [leads, searchTerm, statusFilter, hasWhatsAppFilter, whatsappStatusFilter, cidadeFilter, bairroFilter, dateRangeFilter, sortField, sortOrder]);

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

  // Seleção em massa
  const handleSelectAll = () => {
    if (selectedLeads.size === paginatedLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(paginatedLeads.map(l => l.id)));
    }
  };

  const handleSelectLead = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const getSelectedLeadsData = () => {
    return leads.filter(lead => selectedLeads.has(lead.id));
  };

  // Exportação melhorada
  const handleExport = (format: "csv" | "excel", columns: string[]) => {
    const leadsToExport = selectedLeads.size > 0 ? getSelectedLeadsData() : filteredAndSortedLeads;
    const filename = `leads-${new Date().toISOString().split('T')[0]}`;

    if (format === "csv") {
      exportToCSV(leadsToExport, filename, columns);
    } else {
      exportToExcel(leadsToExport, filename, columns);
    }

    auditExport(leadsToExport.length, format);
    toast.success(`${leadsToExport.length} leads exportados em ${format.toUpperCase()}!`);
  };

  // WhatsApp em massa
  const handleBulkWhatsApp = () => {
    if (selectedLeads.size === 0) {
      toast.error("Selecione pelo menos um lead");
      return;
    }
    setIsWhatsAppModalOpen(true);
  };

  // Deletar em massa
  const handleBulkDelete = async () => {
    const selectedIds = Array.from(selectedLeads);

    // Log de auditoria
    auditBulkDelete(selectedIds);

    // Remover da lista local (em produção, chamaria API)
    setLeads(leads.filter(lead => !selectedLeads.has(lead.id)));
    setSelectedLeads(new Set());
    setIsDeleteDialogOpen(false);

    toast.success(`${selectedIds.length} lead(s) removido(s)`);
  };

  // WhatsApp individual
  const handleIndividualWhatsApp = (lead: Lead) => {
    if (!lead.whatsapp || !lead.mensagemWhatsApp) {
      toast.error("Lead não possui WhatsApp ou mensagem configurados");
      return;
    }

    // Selecionar apenas este lead e abrir modal
    setSelectedLeads(new Set([lead.id]));
    setIsWhatsAppModalOpen(true);
  };

  // Editar lead
  const handleEditLead = (lead: Lead) => {
    setLeadToEdit(lead);
    setIsEditModalOpen(true);
  };

  // Callback quando edição for bem-sucedida
  const handleEditSuccess = async () => {
    setIsEditModalOpen(false);
    setLeadToEdit(null);
    await loadLeads(); // Recarregar leads após edição
  };

  const exportColumns = [
    "Lead", "Status", "Empresa", "WhatsApp",
    "Contato Principal", "Segmento", "Região",
    "Ticket Médio", "Origem", "Data Contato",
    "Prioridade", "Observações", "Status WhatsApp", "Data Envio WA"
  ];

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
      "Fechado": "default",
      "Follow-up": "secondary",
    };
    return variants[status];
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
    <div className="container mx-auto px-2 py-6 max-w-full">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {filteredAndSortedLeads.length} de {leads.length} leads
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="bg-muted p-1 rounded-lg flex items-center mr-2">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-3"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4 mr-2" />
              Lista
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-3"
              onClick={() => setViewMode('kanban')}
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              Kanban
            </Button>
          </div>

          <Button onClick={() => setIsExportModalOpen(true)} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Exportar
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
          hasWhatsAppFilter={hasWhatsAppFilter}
          setHasWhatsAppFilter={setHasWhatsAppFilter}
          whatsappStatusFilter={whatsappStatusFilter}
          setWhatsappStatusFilter={setWhatsappStatusFilter}
          cidadeFilter={cidadeFilter}
          setCidadeFilter={setCidadeFilter}
          bairroFilter={bairroFilter}
          setBairroFilter={setBairroFilter}
          dateRangeFilter={dateRangeFilter}
          setDateRangeFilter={setDateRangeFilter}
        />
      </div>

      {/* Content Area: Table or Kanban */}
      {viewMode === 'list' ? (
        <>
          {/* Tabela */}
          <div className="rounded-lg border bg-card shadow-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {(hasPermission('canUpdate') || hasPermission('canDelete') || hasPermission('canSendWhatsApp')) && (
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedLeads.size === paginatedLeads.length && paginatedLeads.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                  )}
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
                  <TableHead>Data</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Bairro</TableHead>
                  <TableHead>Endereço</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>GMN</TableHead>
                  <TableHead>Resumo Analítico</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="text-center py-8 text-muted-foreground">
                      Nenhum lead encontrado com os filtros selecionados
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLeads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className={selectedLeads.has(lead.id) ? "bg-primary/5" : ""}
                    >
                      {(hasPermission('canUpdate') || hasPermission('canDelete') || hasPermission('canSendWhatsApp')) && (
                        <TableCell>
                          <Checkbox
                            checked={selectedLeads.has(lead.id)}
                            onCheckedChange={() => handleSelectLead(lead.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{toTitleCase(lead.lead)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(lead.status)}>
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{toTitleCase(lead.empresa || "-")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.data || "-"}
                      </TableCell>
                      <TableCell>
                        {lead.whatsapp && lead.whatsapp.trim() !== "" ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="success" className="w-fit">
                              ✓ WhatsApp
                            </Badge>
                            <span className="text-xs text-muted-foreground font-mono">
                              {lead.whatsapp}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {lead.telefone && lead.telefone.trim() !== "" ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="secondary" className="w-fit">
                              📞 Telefone
                            </Badge>
                            <span className="text-xs text-muted-foreground font-mono">
                              {lead.telefone}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {toTitleCase(lead.categoria || "-")}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {lead.cnpj || "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {toTitleCase(lead.cidade || "-")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {toTitleCase(lead.bairro || lead.bairroRegiao || "-")}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate" title={lead.endereco}>
                        {toTitleCase(lead.endereco || "-")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {lead.website ? (
                          <a
                            href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Link
                          </a>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {lead.linkGMN ? (
                          <a
                            href={lead.linkGMN}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Ver
                          </a>
                        ) : (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.empresa || lead.lead} ${lead.cidade || ''}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-blue-600 hover:underline flex items-center gap-1"
                            title="Buscar no Google Maps"
                          >
                            <Search className="h-3 w-3" />
                            Buscar
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-[250px] truncate" title={lead.resumoAnalitico}>
                        {lead.resumoAnalitico || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2 justify-end">
                          <RoleGuard requiredPermission="canUpdate">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditLead(lead)}
                              title="Editar lead"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </RoleGuard>
                          <RoleGuard requiredPermission="canSendWhatsApp">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleIndividualWhatsApp(lead)}
                              disabled={!lead.whatsapp || lead.whatsapp.trim() === "" || !lead.mensagemWhatsApp}
                              title={
                                !lead.whatsapp ? "Lead sem WhatsApp" :
                                  !lead.mensagemWhatsApp ? "Lead sem mensagem configurada" :
                                    "Enviar WhatsApp"
                              }
                              className={
                                lead.whatsapp && lead.mensagemWhatsApp
                                  ? "hover:text-green-600"
                                  : "opacity-50 cursor-not-allowed"
                              }
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          </RoleGuard>
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
        </>
      ) : (
        /* Kanban View */
        <div className="h-full">
          <KanbanBoard
            leads={filteredAndSortedLeads}
            onLeadUpdate={loadLeads}
          />
        </div>
      )}

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedLeads.size}
        onClearSelection={() => setSelectedLeads(new Set())}
        onExport={() => setIsExportModalOpen(true)}
        onApplyTemplate={() => setIsApplyTemplateModalOpen(true)}
        onWhatsApp={handleBulkWhatsApp}
        onDelete={() => setIsDeleteDialogOpen(true)}
        canExport={permissions.canExport}
        canSendWhatsApp={permissions.canSendWhatsApp}
        canUpdate={permissions.canUpdate}
        canDelete={permissions.canBulkDelete}
      />

      {/* Apply Template Modal */}
      <ApplyTemplateModal
        isOpen={isApplyTemplateModalOpen}
        onClose={() => {
          setIsApplyTemplateModalOpen(false);
          setSelectedLeads(new Set());
        }}
        selectedLeads={getSelectedLeadsData()}
        onTemplateApplied={() => {
          loadLeads(); // Recarregar após aplicar template
        }}
      />

      {/* WhatsApp Dispatch Modal */}
      <WhatsAppDispatchModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => {
          setIsWhatsAppModalOpen(false);
          setSelectedLeads(new Set());
          loadLeads(); // Recarregar após envio
        }}
        selectedLeads={getSelectedLeadsData()}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExport}
        availableColumns={exportColumns}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedLeads.size} lead(s)?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Lead Modal */}
      <LeadEditModal
        lead={leadToEdit}
        open={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setLeadToEdit(null);
        }}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
};

export default LeadsTable;
