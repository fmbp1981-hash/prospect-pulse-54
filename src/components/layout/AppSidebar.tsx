'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, LayoutDashboard, Table2, LayoutGrid,
  MessageSquare, Users, Megaphone,
  Link2, Settings, BookOpen, LogOut,
} from "lucide-react";
import { NavLink } from "@/components/layout/NavLink";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { TemplateManager } from "@/components/shared/TemplateManager";
import { useUserRole } from "@/hooks/useUserRole";
import { useUnreadConversations } from "@/hooks/useUnreadConversations";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  badge?: number | null;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const LOGO_SRC = "/Logotipo-removebg-preview.png.png";

export function AppSidebar() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { role } = useUserRole();
  const { unreadCount } = useUnreadConversations();
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);

  const sections: NavSection[] = [
    {
      label: "Prospecção",
      items: [
        { title: "Prospectar", url: "/", icon: Search },
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Leads", url: "/leads", icon: Table2 },
        { title: "Kanban", url: "/kanban", icon: LayoutGrid },
      ],
    },
    {
      label: "Comunicação",
      items: [
        { title: "Inbox", url: "/inbox", icon: MessageSquare, badge: unreadCount || null },
        { title: "Clientes", url: "/clientes", icon: Users },
        { title: "Campanhas", url: "/campanhas", icon: Megaphone },
      ],
    },
    {
      label: "Sistema",
      items: [
        { title: "Integrações", url: "/integrations", icon: Link2 },
        { title: "Configurações", url: "/settings", icon: Settings },
        { title: "Tutorial", url: "/tutorial", icon: BookOpen },
      ],
    },
  ];

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  const email = user?.email ?? "";
  const initials = email.length >= 2 ? email.slice(0, 2).toUpperCase() : "??";
  const emailDisplay = email || "Usuário";

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-sidebar"
    >
      <SidebarContent className="flex flex-col h-full">

        {/* ── Logo */}
        <div className={cn(
          "flex items-center gap-2.5 border-b border-sidebar-border",
          isCollapsed ? "px-3 py-4 justify-center" : "px-4 py-4"
        )}>
          <div className="w-6 h-6 bg-primary rounded flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 6L6 1L11 6L6 11L1 6Z" fill="hsl(var(--primary-foreground))"/>
            </svg>
          </div>
          {!isCollapsed && (
            <span className="text-sm font-semibold text-sidebar-foreground tracking-tight">
              LeadFinder <span style={{color: "hsl(var(--sidebar-primary))"}}>Pro</span>
            </span>
          )}
        </div>

        {/* ── Nav sections */}
        <div className="flex-1 overflow-y-auto py-3">
          {sections.map((section) => (
            <SidebarGroup key={section.label} className="mb-1 px-0">
              {!isCollapsed && (
                <div className="px-4 pb-1 pt-2">
                  <span className="font-mono text-2xs font-medium text-muted-foreground tracking-widest uppercase">
                    {section.label}
                  </span>
                </div>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        {item.title === "Templates" ? (
                          <button
                            onClick={() => setIsTemplateManagerOpen(true)}
                            className={cn(
                              "flex w-full items-center gap-2.5 px-4 py-1.5",
                              "text-sm text-muted-foreground",
                              "border-l-2 border-transparent",
                              "transition-colors duration-100",
                              "hover:text-foreground hover:bg-hover hover:border-l-border-strong"
                            )}
                          >
                            <item.icon className="h-[15px] w-[15px] flex-shrink-0" />
                            {!isCollapsed && <span>{item.title}</span>}
                          </button>
                        ) : (
                          <NavLink
                            href={item.url}
                            className={cn(
                              "flex w-full items-center gap-2.5 px-4 py-1.5",
                              "text-sm text-muted-foreground",
                              "border-l-2 border-transparent",
                              "transition-colors duration-100",
                              "hover:text-foreground hover:bg-hover hover:border-l-border-strong"
                            )}
                            activeClassName="text-foreground bg-raised border-l-primary font-medium"
                          >
                            <item.icon className="h-[15px] w-[15px] flex-shrink-0" />
                            {!isCollapsed && <span>{item.title}</span>}
                            {!isCollapsed && item.badge != null && item.badge > 0 && (
                              <span className="ml-auto font-mono text-2xs font-medium bg-destructive text-destructive-foreground px-1.5 py-px rounded-sm min-w-[18px] text-center">
                                {item.badge}
                              </span>
                            )}
                          </NavLink>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </div>

        {/* ── User footer */}
        <div className="border-t border-sidebar-border px-3 py-3 space-y-2">
          <div className="flex items-center gap-2">
            {/* Avatar */}
            <div className="w-7 h-7 rounded border border-sidebar-border bg-raised flex items-center justify-center flex-shrink-0">
              <span className="font-mono text-2xs font-medium text-muted-foreground">
                {initials}
              </span>
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">
                  {emailDisplay}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground tracking-wider uppercase leading-tight mt-px">
                  {role ?? "—"}
                </p>
              </div>
            )}
            <ThemeToggle />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className={cn(
              "w-full h-7 text-xs text-muted-foreground",
              "hover:text-destructive hover:bg-destructive/10",
              "border border-transparent hover:border-destructive/20",
              "transition-colors duration-100",
              isCollapsed ? "justify-center px-0" : "justify-start gap-2"
            )}
          >
            <LogOut className="h-3.5 w-3.5 flex-shrink-0" />
            {!isCollapsed && "Sair"}
          </Button>
        </div>

      
        {/* IntelliX.AI logo — last element, gradient backdrop */}
        <div
          className={cn(
            "relative flex items-center justify-center overflow-hidden border-t border-sidebar-border",
            isCollapsed ? "py-3 px-2" : "py-6 px-4"
          )}
          style={{
            background: "linear-gradient(to top, hsl(var(--sidebar-background)) 0%, hsl(var(--sidebar-background) / 0.5) 70%, transparent 100%)",
          }}
        >
          <img
            src={LOGO_SRC}
            alt="IntelliX.AI"
            className={cn(
              "object-contain transition-opacity duration-150",
              "opacity-60 hover:opacity-90",
              isCollapsed ? "h-8 w-8" : "h-24 w-auto mx-auto"
            )}
            
          />
        </div>

      </SidebarContent>

      <TemplateManager
        isOpen={isTemplateManagerOpen}
        onClose={() => setIsTemplateManagerOpen(false)}
      />
    </Sidebar>
  );
}
