'use client';

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
}

/** Mapa de rotas para labels do breadcrumb */
const ROUTE_LABELS: Record<string, string> = {
  "/":            "Prospecção",
  "/dashboard":   "Dashboard",
  "/leads":       "Leads",
  "/kanban":      "Kanban",
  "/inbox":       "Inbox",
  "/clientes":    "Clientes",
  "/campanhas":   "Campanhas",
  "/integrations": "Integrações",
  "/settings":    "Configurações",
  "/tutorial":    "Tutorial",
  "/pending":     "Acesso Pendente",
};

export function Layout({ children }: LayoutProps) {
  const pathname = usePathname();
  const pageLabel = ROUTE_LABELS[pathname] ?? "LeadFinder Pro";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />

        <main className="flex-1 flex flex-col min-w-0">

          {/* ── Topbar */}
          <header className={cn(
            "sticky top-0 z-10 flex h-[52px] items-center justify-between",
            "border-b border-border bg-background",
            "px-5 gap-4 flex-shrink-0"
          )}>
            {/* Left: trigger + breadcrumb */}
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-7 w-7 text-muted-foreground hover:text-foreground transition-colors" />
              <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground select-none">
                <span>sistema</span>
                <span className="text-border-strong">/</span>
                <span className="text-foreground font-medium">{pageLabel}</span>
              </div>
            </div>

            {/* Right: theme toggle */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          </header>

          {/* ── Page content */}
          <div className="flex-1 overflow-auto animate-fade-in">
            {children}
          </div>

        </main>
      </div>
    </SidebarProvider>
  );
}
