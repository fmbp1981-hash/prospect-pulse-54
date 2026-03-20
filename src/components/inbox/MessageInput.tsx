'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Loader2 } from 'lucide-react';

interface MessageInputProps {
  disabled: boolean;
  onSend: (message: string) => Promise<void>;
}

export function MessageInput({ disabled, onSend }: MessageInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const msg = text.trim();
    if (!msg || disabled) return;
    setSending(true);
    try {
      await onSend(msg);
      setText('');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-2 p-3 border-t border-border bg-card">
      <Textarea
        placeholder={disabled ? 'Assuma a conversa para enviar mensagens...' : 'Digite sua mensagem...'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || sending}
        rows={1}
        className="min-h-[40px] max-h-[120px] resize-none text-sm"
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={disabled || sending || !text.trim()}
        className="shrink-0 h-10 w-10"
      >
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
