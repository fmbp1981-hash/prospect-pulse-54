import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, FileSpreadsheet } from "lucide-react";
import { useState } from "react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: "csv" | "excel", columns: string[]) => void;
  availableColumns: string[];
}

export const ExportModal = ({ 
  isOpen, 
  onClose, 
  onExport, 
  availableColumns 
}: ExportModalProps) => {
  const [format, setFormat] = useState<"csv" | "excel">("excel");
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set(availableColumns)
  );

  const handleToggleColumn = (column: string) => {
    const newSet = new Set(selectedColumns);
    if (newSet.has(column)) {
      newSet.delete(column);
    } else {
      newSet.add(column);
    }
    setSelectedColumns(newSet);
  };

  const handleSelectAll = () => {
    if (selectedColumns.size === availableColumns.length) {
      setSelectedColumns(new Set());
    } else {
      setSelectedColumns(new Set(availableColumns));
    }
  };

  const handleExport = () => {
    onExport(format, Array.from(selectedColumns));
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar Leads</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Formato */}
          <div className="space-y-3">
            <Label>Formato de Exportação</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as "csv" | "excel")}>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted cursor-pointer transition-colors">
                <RadioGroupItem value="excel" id="excel" />
                <Label htmlFor="excel" className="flex items-center gap-2 cursor-pointer flex-1">
                  <FileSpreadsheet className="h-4 w-4 text-success" />
                  Excel (.xlsx)
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted cursor-pointer transition-colors">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="flex items-center gap-2 cursor-pointer flex-1">
                  <FileText className="h-4 w-4 text-primary" />
                  CSV (.csv)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Colunas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Colunas a Exportar</Label>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleSelectAll}
              >
                {selectedColumns.size === availableColumns.length ? "Desmarcar todas" : "Marcar todas"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border rounded-lg">
              {availableColumns.map(column => (
                <div key={column} className="flex items-center space-x-2">
                  <Checkbox
                    id={column}
                    checked={selectedColumns.has(column)}
                    onCheckedChange={() => handleToggleColumn(column)}
                  />
                  <Label htmlFor={column} className="text-sm cursor-pointer">
                    {column}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button 
              onClick={handleExport} 
              className="flex-1"
              disabled={selectedColumns.size === 0}
            >
              Exportar {selectedColumns.size} colunas
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
