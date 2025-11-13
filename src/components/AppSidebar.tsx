import { useState, useEffect } from "react";
import { LayoutDashboard, Table, Search, Settings, Link2, MessageSquare, CheckCircle } from "lucide-react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const items = [
  { title: "Prospecção", url: "/", icon: Search },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Tabela de Leads", url: "/leads", icon: Table },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [prospectionWebhook, setProspectionWebhook] = useState("");
  const [whatsappWebhook, setWhatsappWebhook] = useState("");

  // Carregar webhooks do localStorage
  useEffect(() => {
    setProspectionWebhook(localStorage.getItem("prospection_webhook_url") || "");
    setWhatsappWebhook(localStorage.getItem("whatsapp_webhook_url") || "");
  }, []);

  // Salvar webhooks no localStorage com debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (prospectionWebhook) {
        localStorage.setItem("prospection_webhook_url", prospectionWebhook);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [prospectionWebhook]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (whatsappWebhook) {
        localStorage.setItem("whatsapp_webhook_url", whatsappWebhook);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [whatsappWebhook]);

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
          <Collapsible open={isConfigOpen} onOpenChange={setIsConfigOpen}>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                tooltip="Configurações"
                className="group hover:bg-muted transition-all"
              >
                <Settings className="h-5 w-5" />
                {!isCollapsed && (
                  <>
                    <span className="font-medium">Configurações</span>
                    <motion.div
                      animate={{ rotate: isConfigOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="ml-auto"
                    >
                      ▼
                    </motion.div>
                  </>
                )}
              </SidebarMenuButton>
            </CollapsibleTrigger>

            {!isCollapsed && (
              <CollapsibleContent className="space-y-4 pt-4 px-2">
                {/* Webhook Prospecção */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Link2 className="h-3 w-3" />
                    Webhook Prospecção
                    {prospectionWebhook && (
                      <CheckCircle className="h-3 w-3 text-success ml-auto" />
                    )}
                  </Label>
                  <Input
                    value={prospectionWebhook}
                    onChange={(e) => setProspectionWebhook(e.target.value)}
                    placeholder="https://n8n.com/webhook/..."
                    className="h-8 text-xs"
                  />
                </div>

                {/* Webhook WhatsApp */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3" />
                    Webhook WhatsApp
                    {whatsappWebhook && (
                      <CheckCircle className="h-3 w-3 text-success ml-auto" />
                    )}
                  </Label>
                  <Input
                    value={whatsappWebhook}
                    onChange={(e) => setWhatsappWebhook(e.target.value)}
                    placeholder="https://n8n.com/webhook/..."
                    className="h-8 text-xs"
                  />
                </div>
              </CollapsibleContent>
            )}
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
