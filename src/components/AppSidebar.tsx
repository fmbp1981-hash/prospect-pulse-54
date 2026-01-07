'use client';

import { useState, useEffect } from "react";
import { LayoutDashboard, Table, Search, Settings, Link2, MessageSquare, CheckCircle, LogOut, User, FileText, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { NavLink } from "@/components/NavLink";
import { Logo } from "@/components/Logo";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplateManager } from "@/components/TemplateManager";
import { RoleBadge } from "@/components/RoleBadge";

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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [whatsappWebhook, setWhatsappWebhook] = useState("");

  useEffect(() => {
    const savedWebhook = localStorage.getItem("whatsapp_webhook_url");
    if (savedWebhook) setWhatsappWebhook(savedWebhook);
  }, []);

  const handleSaveConfiguration = () => {
    localStorage.setItem("whatsapp_webhook_url", whatsappWebhook);
    toast.success("Configurações salvas com sucesso!");
    setIsDialogOpen(false);
  };

  const handleCancelConfiguration = () => {
    const savedWebhook = localStorage.getItem("whatsapp_webhook_url");
    setWhatsappWebhook(savedWebhook || "");
    setIsDialogOpen(false);
  };

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

        {/* Configurações Section - ADMIN ONLY */}
        {isAdmin && (
          <SidebarGroup className="px-3 py-4 border-t border-border/40">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <SidebarMenuButton
                  tooltip="Configurações de Webhook WhatsApp"
                  className="group hover:bg-muted transition-all"
                >
                  <Link2 className="h-5 w-5" />
                  {!isCollapsed && <span className="font-medium">Config. Webhook</span>}
                </SidebarMenuButton>
              </DialogTrigger>

              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Link2 className="h-5 w-5" />
                    Configurações de Integrações
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                  {/* Webhook WhatsApp */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      Webhook de WhatsApp
                      {whatsappWebhook && (
                        <CheckCircle className="h-4 w-4 text-success ml-auto" />
                      )}
                    </Label>
                    <Input
                      value={whatsappWebhook}
                      onChange={(e) => setWhatsappWebhook(e.target.value)}
                      placeholder="https://seu-n8n.com/webhook/whatsapp"
                      className="font-mono text-xs"
                      type="password"
                    />
                    <p className="text-xs text-muted-foreground">
                      URL do webhook n8n para envio via Evolution API
                    </p>
                  </div>

                  <div className="border-t" />

                  {/* Gerenciador de Templates */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      Templates de Mensagens
                    </Label>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setIsTemplateManagerOpen(true)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Gerenciar Templates
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Crie e personalize templates para mensagens WhatsApp
                    </p>
                  </div>

                  <div className="border-t" />

                  {/* Status da Conexão */}
                  <div className="rounded-lg bg-muted/50 p-4">
                    <h4 className="text-sm font-medium mb-2">Status da Configuração</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        {whatsappWebhook ? (
                          <>
                            <CheckCircle className="h-3 w-3 text-success" />
                            <span className="text-success">WhatsApp configurado</span>
                          </>
                        ) : (
                          <>
                            <div className="h-3 w-3 rounded-full bg-yellow-500" />
                            <span className="text-muted-foreground">WhatsApp não configurado</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                    <strong>💡 Dica:</strong> Mantenha esse endereço em segredo para proteger sua integração.
                  </p>
                </div>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" onClick={handleCancelConfiguration}>
                      Cancelar
                    </Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button onClick={handleSaveConfiguration}>
                      Salvar Configurações
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </SidebarGroup>
        )}

        {/* User Section */}
        <SidebarGroup className="mt-auto border-t border-border/40 pt-4">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <div className="px-3 py-2 space-y-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {!isCollapsed && (
                        <span className="text-muted-foreground truncate">
                          {user?.email || "Usuário"}
                        </span>
                      )}
                    </div>
                    {!isCollapsed && (
                      <RoleBadge showIcon className="text-xs" />
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={signOut}
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

        {/* IntelliX.AI Footer */}
        <SidebarGroup className="border-t border-border/40 pt-3 pb-3">
          <SidebarGroupContent>
            <div className="px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
              <img
                src="/intellix-logo.png"
                alt="IntelliX.AI"
                className="h-6 w-6 object-contain"
              />
              {!isCollapsed && (
                <span>Desenvolvido por <strong className="text-primary">IntelliX.AI</strong></span>
              )}
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
