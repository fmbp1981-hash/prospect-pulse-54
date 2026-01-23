'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Table, Search, Settings, Link2, LogOut, User, FileText, LayoutGrid } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Logo } from "@/components/Logo";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { TemplateManager } from "@/components/TemplateManager";
import { RoleBadge } from "@/components/RoleBadge";
import { ThemeToggle } from "@/components/ThemeToggle";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const items = [
  { title: "Prospecção", url: "/", icon: Search },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Tabela de Leads", url: "/leads", icon: Table },
  { title: "Kanban Board", url: "/kanban", icon: LayoutGrid },
  { title: "Templates", url: "#", icon: FileText },
  { title: "Integrações", url: "/integrations", icon: Link2 },
  { title: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);

  return (
    <Sidebar collapsible="icon" className="bg-sidebar border-r border-sidebar-border">
      <SidebarContent>
        {/* Logo no topo */}
        <div className="px-4 py-5 border-b border-sidebar-border">
          <Logo size={isCollapsed ? "sm" : "md"} showText={!isCollapsed} />
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1, duration: 0.2 }}
                >
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      {item.title === "Templates" ? (
                        <button
                          onClick={() => setIsTemplateManagerOpen(true)}
                          className="group relative overflow-hidden rounded-lg transition-all duration-200 hover:scale-[1.02] hover:bg-primary hover:text-primary-foreground hover:shadow-lg my-1 flex w-full items-center gap-2 p-2"
                        >
                          <item.icon className="h-5 w-5 transition-transform group-hover:scale-110" />
                          {!isCollapsed && <span className="font-medium">{item.title}</span>}
                        </button>
                      ) : (
                        <NavLink
                          href={item.url}
                          className="group relative overflow-hidden rounded-lg transition-all duration-200 hover:scale-[1.02] hover:bg-primary hover:text-primary-foreground hover:shadow-lg my-1"
                          activeClassName="bg-primary text-primary-foreground shadow-md before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-success before:rounded-l-lg"
                        >
                          <item.icon className="h-5 w-5 transition-transform group-hover:scale-110" />
                          {!isCollapsed && <span className="font-medium">{item.title}</span>}
                        </NavLink>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </motion.div>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* User Section */}
        <SidebarGroup className="mt-auto border-t border-border/40 pt-4">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <div className="px-3 py-2 space-y-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {!isCollapsed && (
                          <span className="text-muted-foreground truncate">
                            {user?.email || "Usuário"}
                          </span>
                        )}
                      </div>
                      <ThemeToggle />
                    </div>
                    {!isCollapsed && (
                      <RoleBadge showIcon className="text-xs" />
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    {!isCollapsed && "Sair"}
                  </Button>
                </div>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* IntelliX.AI Footer - Logo only */}
        <SidebarGroup className="border-t border-border/40 pt-3 pb-3 bg-slate-800 dark:bg-slate-900 rounded-lg mx-2 mb-2">
          <SidebarGroupContent>
            <div className="px-3 py-2 flex justify-center">
              <img
                src="/Logotipo-removebg-preview.png.png"
                alt="IntelliX.AI"
                className="h-24 w-24 object-contain"
              />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Template Manager Modal */}
      <TemplateManager
        isOpen={isTemplateManagerOpen}
        onClose={() => setIsTemplateManagerOpen(false)}
      />
    </Sidebar>
  );
}
