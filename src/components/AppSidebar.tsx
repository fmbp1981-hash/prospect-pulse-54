import { useState, useEffect } from "react";
import { LayoutDashboard, Table, Search, Settings, Link2, MessageSquare, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { NavLink } from "@/components/NavLink";
import { Logo } from "@/components/Logo";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
];

export function AppSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const [prospectionWebhook, setProspectionWebhook] = useState("");
  const [whatsappWebhook, setWhatsappWebhook] = useState("");

  // Carregar webhooks do localStorage
  useEffect(() => {
    setProspectionWebhook(localStorage.getItem("prospection_webhook_url") || "");
    setWhatsappWebhook(localStorage.getItem("whatsapp_webhook_url") || "");
  }, []);

  const handleSaveConfiguration = () => {
    localStorage.setItem("prospection_webhook_url", prospectionWebhook);
    localStorage.setItem("whatsapp_webhook_url", whatsappWebhook);
    toast.success("Configurações salvas com sucesso!");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/40 bg-gradient-to-b from-background to-muted/20">
      <SidebarContent>
        {/* Logo Section */}
        <div className="p-6 border-b border-border/40">
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Logo showText={!isCollapsed} animated={true} />
          </motion.div>
        </div>

        {/* Navigation Items */}
        <SidebarGroup className="px-3 py-6">
          <SidebarGroupLabel>
            {!isCollapsed && "Menu Principal"}
          </SidebarGroupLabel>
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
                      <NavLink 
                        to={item.url}
                        className="group relative overflow-hidden rounded-lg transition-all duration-200 hover:scale-[1.02] hover:bg-primary hover:text-primary-foreground hover:shadow-lg my-1"
                        activeClassName="bg-primary text-primary-foreground shadow-md before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-success before:rounded-l-lg"
                      >
                        <item.icon className="h-5 w-5 transition-transform group-hover:scale-110" />
                        {!isCollapsed && <span className="font-medium">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </motion.div>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Configurações Section */}
        <SidebarGroup className="px-3 py-4 border-t border-border/40">
          <Dialog>
            <DialogTrigger asChild>
              <SidebarMenuButton
                tooltip="Configurações"
                className="group hover:bg-muted transition-all"
              >
                <Settings className="h-5 w-5" />
                {!isCollapsed && <span className="font-medium">Configurações</span>}
              </SidebarMenuButton>
            </DialogTrigger>
            
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configurações de Webhooks
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {/* Webhook Prospecção */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary" />
                    Webhook de Prospecção
                    {prospectionWebhook && (
                      <CheckCircle className="h-4 w-4 text-success ml-auto" />
                    )}
                  </Label>
                  <Input
                    value={prospectionWebhook}
                    onChange={(e) => setProspectionWebhook(e.target.value)}
                    placeholder="https://seu-n8n.com/webhook/prospeccao"
                    className="font-mono text-xs"
                    type="password"
                  />
                  <p className="text-xs text-muted-foreground">
                    URL do webhook n8n para integração com Google Places API
                  </p>
                </div>
                
                <div className="border-t" />
                
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
                
                {/* Status da Conexão */}
                <div className="rounded-lg bg-muted/50 p-4">
                  <h4 className="text-sm font-medium mb-2">Status da Configuração</h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      {prospectionWebhook ? (
                        <>
                          <CheckCircle className="h-3 w-3 text-success" />
                          <span className="text-success">Prospecção configurada</span>
                        </>
                      ) : (
                        <>
                          <div className="h-3 w-3 rounded-full bg-yellow-500" />
                          <span className="text-muted-foreground">Prospecção não configurada</span>
                        </>
                      )}
                    </div>
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
                  <strong>💡 Dica:</strong> Mantenha esses endereços em segredo para proteger sua integração.
                </p>
              </div>
              
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
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
      </SidebarContent>
    </Sidebar>
  );
}
