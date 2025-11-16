import { KanbanBoard } from "@/components/KanbanBoard";
import { LayoutGrid } from "lucide-react";

export default function Kanban() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          <LayoutGrid className="h-10 w-10 text-primary" />
          Kanban Board
        </h1>
        <p className="text-xl text-muted-foreground">
          Visualize e gerencie seus leads arrastando entre as colunas
        </p>
      </div>

      {/* Kanban Board */}
      <div className="animate-fade-in">
        <KanbanBoard />
      </div>
    </div>
  );
}
