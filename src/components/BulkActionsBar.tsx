import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MessageCircle, Download, Trash2, X, FileText } from "lucide-react";

interface BulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onExport: () => void;
  onWhatsApp: () => void;
  onApplyTemplate?: () => void;
  onDelete: () => void;
  // Permissões opcionais (padrão: todas habilitadas)
  canExport?: boolean;
  canSendWhatsApp?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}

export const BulkActionsBar = ({
  selectedCount,
  onClearSelection,
  onExport,
  onWhatsApp,
  onApplyTemplate,
  onDelete,
  canExport = true,
  canSendWhatsApp = true,
  canUpdate = true,
  canDelete: canDeletePerm = true,
}: BulkActionsBarProps) => {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="bg-primary text-primary-foreground rounded-full shadow-2xl px-6 py-4 flex items-center gap-4">
            <span className="font-semibold">{selectedCount} lead(s) selecionado(s)</span>
            
            <div className="flex gap-2">
              {canExport && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={onExport}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
              )}

              {canUpdate && onApplyTemplate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={onApplyTemplate}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Aplicar Template
                </Button>
              )}

              {canSendWhatsApp && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={onWhatsApp}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
              )}

              {canDeletePerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary-foreground hover:bg-destructive/20"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary-foreground/20 ml-2"
              onClick={onClearSelection}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
