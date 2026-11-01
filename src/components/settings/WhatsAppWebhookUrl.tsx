"use client";

import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WhatsAppWebhookUrlProps {
  /** user_settings.webhook_token (64 hex). Vazio enquanto a migration não foi aplicada. */
  token: string;
}

/**
 * URL do webhook de recebimento do WhatsApp deste tenant:
 * <origem>/api/webhooks/evolution/<webhook_token>. O token é secreto.
 */
export function WhatsAppWebhookUrl({ token }: WhatsAppWebhookUrlProps) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!token) {
    return (
      <p className="text-xs text-muted-foreground">
        URL do webhook indisponível. Recarregue a página ou fale com o suporte.
      </p>
    );
  }

  const url = `${origin}/api/webhooks/evolution/${token}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL do webhook copiada");
    } catch {
      toast.error("Não foi possível copiar a URL");
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="whatsapp_webhook_url">URL do webhook (recebimento)</Label>
      <div className="flex gap-2 max-w-full md:max-w-xl">
        <Input
          id="whatsapp_webhook_url"
          readOnly
          value={url}
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button type="button" variant="outline" size="icon" onClick={handleCopy} aria-label="Copiar URL do webhook">
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cadastre esta URL no webhook da sua instância (evento MESSAGES_UPSERT). Ela contém um
        token secreto: não compartilhe.
      </p>
    </div>
  );
}
