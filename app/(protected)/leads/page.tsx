'use client';

import { useState, useEffect, useMemo } from "react";
import { supabaseCRM } from "@/lib/supabaseCRM";
import { Lead, LeadStatus } from "@/types/prospection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, RefreshCw, ArrowUpDown, Edit, MessageCircle, Download, ExternalLink, LayoutGrid, List, TableIcon } from "lucide-react";
import { toast } from "sonner";
import { LeadsFilters } from "@/components/leads/LeadsFilters";
import { toTitleCase, searchMatch } from "@/lib/utils";
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

export default function LeadsPage() {
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
    try {
      const result = await supabaseCRM.syncAllLeads();

      if (result.success) {
        setLeads(Array.isArray(result.leads) ? result.leads : []);
      } else {
        toast.error("Erro ao carregar leads", {
          description: result.message || "Erro ao acessar banco de dados",
        });
      }
    } catch (error) {
      console.error("Erro ao carregar leads:", error);
      toast.error("Erro ao carregar leads", {
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
    } finally {
      setIsLoading(false);
    }
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
    let result = [...leads];

    // Busca normalizada (sem acentos, case insensitive)
    if (searchTerm) {
      result = result.filter(lead =>
        searchMatch(lead.lead || "", searchTerm) ||
        searchMatch(lead.empresa || "", searchTerm) ||
        searchMatch(lead.categoria || "", searchTerm) ||
        searchMatch(lead.cidade || "", searchTerm) ||
        searchMatch(lead.bairro || "", searchTerm) ||
        lead.whatsapp?.includes(searchTerm) ||
        lead.telefone?.includes(searchTerm) ||
        searchMatch(lead.email || "", searchTerm)
      );
    }

    // Filtro de status
    if (statusFilter !== "all") {
      result = result.filter(lead => lead.status === statusFilter);
    }

    // Filtro WhatsApp
    if (hasWhatsAppFilter) {
      result = result.filter(lead => lead.whatsapp && lead.whatsapp.trim() !== "");
    }

    // Filtro status WhatsApp
    if (whatsappStatusFilter !== "all") {
      result = result.filter(lead => lead.statusMsgWA === whatsappStatusFilter);
    }

    // Filtro cidade (normalizado)
    if (cidadeFilter) {
      result = result.filter(lead => searchMatch(lead.cidade || "", cidadeFilter));
    }

    // Filtro bairro (normalizado)
    if (bairroFilter) {
      result = result.filter(lead => searchMatch(lead.bairro || "", bairroFilter));
    }

    // Ordenação
    result.sort((a, b) => {
      const aVal = a[sortField] ?? "";
      const bVal = b[sortField] ?? "";

      if (sortOrder === "asc") {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    return result;
  }, [leads, searchTerm, statusFilter, hasWhatsAppFilter, whatsappStatusFilter, cidadeFilter, bairroFilter, sortField, sortOrder]);

  // Paginação
  const totalPages = Math.ceil(filteredAndSortedLeads.length / itemsPerPage);
  const paginatedLeads = filteredAndSortedLeads.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Handlers
  const handleSelectAll = () => {
    if (selectedLeads.size === paginatedLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(paginatedLeads.map(l => l.id)));
    }
  };

  const handleSelectLead = (id: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedLeads(newSelected);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleEdit = (lead: Lead) => {
    setLeadToEdit(lead);
    setIsEditModalOpen(true);
  };

  const handleBulkDelete = async () => {
    if (selectedLeads.size === 0) return;

    try {
      const leadIdsArray = Array.from(selectedLeads);
      const result = await supabaseCRM.deleteLeads(leadIdsArray);
      if (result.success) {
        await auditBulkDelete(leadIdsArray);
        toast.success(`${selectedLeads.size} leads excluídos com sucesso`);
        setSelectedLeads(new Set());
        loadLeads();
      } else {
        toast.error("Erro ao excluir leads");
      }
    } catch (error) {
      console.error("Erro ao excluir leads:", error);
      toast.error("Erro ao excluir leads");
    }
    setIsDeleteDialogOpen(false);
  };

  const handleExport = async (format: 'csv' | 'excel', columns: string[]) => {
    const selectedLeadsList = leads.filter(l => selectedLeads.has(l.id));
    const filename = `leads_export_${new Date().toISOString().split('T')[0]}`;
    try {
      if (format === 'csv') {
        await exportToCSV(selectedLeadsList, filename, columns);
      } else {
        await exportToExcel(selectedLeadsList, filename, columns);
      }
      await auditExport(selectedLeadsList.length, format);
      toast.success(`Exportação ${format.toUpperCase()} concluída!`);
    } catch (error) {
      console.error("Erro na exportação:", error);
      toast.error("Erro ao exportar leads");
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      "Novo": "bg-blue-500",
      "Contato Inicial": "bg-purple-500",
      "Proposta Enviada": "bg-orange-500",
      "Negociação": "bg-indigo-500",
      "Transferido para Consultor": "bg-cyan-500",
      "Fechado": "bg-green-500",
      "Follow-up": "bg-pink-500",
    };
    return colors[status] || "bg-gray-500";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando leads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <TableIcon className="h-10 w-10 text-primary" />
            Leads
          </h1>
          <p className="text-xl text-muted-foreground">
            {filteredAndSortedLeads.length} leads encontrados
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center border rounded-lg">
            <Button
              variant={viewMode === 'list' ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-r-none"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'kanban' ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className="rounded-l-none"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={handleSync}
            disabled={isSyncing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <KanbanBoard leads={filteredAndSortedLeads} onLeadUpdate={loadLeads} />
      ) : (
        <>
          {/* Filters */}
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
          />

          {/* Bulk Actions */}
          {selectedLeads.size > 0 && (
            <BulkActionsBar
              selectedCount={selectedLeads.size}
              onExport={() => setIsExportModalOpen(true)}
              onWhatsApp={() => setIsWhatsAppModalOpen(true)}
              onApplyTemplate={() => setIsApplyTemplateModalOpen(true)}
              onDelete={() => setIsDeleteDialogOpen(true)}
              onClearSelection={() => setSelectedLeads(new Set())}
              canExport={permissions.canExport}
              canSendWhatsApp={permissions.canSendWhatsApp}
              canUpdate={permissions.canUpdate}
              canDelete={permissions.canDelete}
            />
          )}

          {/* Table com scroll interno */}
          <div className="border rounded-lg overflow-hidden bg-card">
            <div className="leads-table-container">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedLeads.size === paginatedLeads.length && paginatedLeads.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('lead')}>
                      Lead <ArrowUpDown className="inline h-4 w-4 ml-1" />
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('empresa')}>
                      Empresa <ArrowUpDown className="inline h-4 w-4 ml-1" />
                    </TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Links</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>
                      Status <ArrowUpDown className="inline h-4 w-4 ml-1" />
                    </TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedLeads.has(lead.id)}
                          onCheckedChange={() => handleSelectLead(lead.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{lead.lead}</TableCell>
                      <TableCell>{toTitleCase(lead.empresa || "")}</TableCell>
                      <TableCell>{toTitleCase(lead.categoria || "")}</TableCell>
                      <TableCell>
                        {lead.whatsapp ? (
                          <a
                            href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:underline flex items-center gap-1"
                          >
                            <MessageCircle className="h-4 w-4" />
                            {lead.whatsapp}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{toTitleCase(lead.cidade || "")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {lead.website && (
                            <a
                              href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                              title="Website"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Site
                            </a>
                          )}
                          {lead.linkGMN && (
                            <a
                              href={lead.linkGMN}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-600 hover:underline text-xs flex items-center gap-1"
                              title="Google Maps"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Mapa
                            </a>
                          )}
                          {!lead.website && !lead.linkGMN && (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getStatusColor(lead.status || "Novo")} text-white`}>
                          {lead.status || "Novo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <RoleGuard requiredPermission="canUpdate">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(lead)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </RoleGuard>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}

      {/* Modals */}
      <WhatsAppDispatchModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        selectedLeads={leads.filter(l => selectedLeads.has(l.id))}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExport}
        availableColumns={[
          'Lead', 'Status', 'Data', 'Empresa', 'Categoria', 'Contato',
          'WhatsApp', 'Telefone', 'Email', 'Website', 'Instagram',
          'Cidade', 'Endereço', 'Bairro/Região', 'Link Google Maps',
          'CNPJ', 'Resumo Analítico'
        ]}
      />

      <ApplyTemplateModal
        isOpen={isApplyTemplateModalOpen}
        onClose={() => setIsApplyTemplateModalOpen(false)}
        selectedLeads={leads.filter(l => selectedLeads.has(l.id))}
        onTemplateApplied={() => {
          loadLeads();
          // Fluxo contínuo: fecha modal de template e abre modal de WhatsApp automaticamente
          setIsApplyTemplateModalOpen(false);

          // Pequeno delay para garantir que os leads foram atualizados
          setTimeout(() => {
            setIsWhatsAppModalOpen(true);
            toast.success("Templates aplicados! Pronto para enviar.", {
              description: "O modal de envio foi aberto automaticamente.",
              duration: 3000
            });
          }, 500);
        }}
      />

      <LeadEditModal
        open={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setLeadToEdit(null);
        }}
        lead={leadToEdit}
        onSuccess={() => {
          loadLeads();
          setIsEditModalOpen(false);
          setLeadToEdit(null);
        }}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedLeads.size} lead(s)?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
