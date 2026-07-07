import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { getOrCreateSquadConversation, triggerSquadReconciliation } from '@/lib/ai/agentSquad';
import AgentMessageBubble from './AgentMessageBubble';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

export default function AgentRunDialog({ tenantId, tenantName, onClose }) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const conv = await getOrCreateSquadConversation(tenantId, tenantName);
        await triggerSquadReconciliation(conv, tenantId);
        setConversationId(conv.id);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [tenantId, tenantName]);

  useEffect(() => {
    if (!conversationId) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversationId, (data) => {
      setMessages(data.messages || []);
    });
    return () => unsubscribe();
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle>Squad Dedicado — {tenantName || tenantId}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Agente Analista Financeiro exclusivo deste tenant executando a conciliação.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
          {error && <p className="text-sm text-red-400">Erro: {error}</p>}
          {!error && messages.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Evocando o squad do tenant...
            </div>
          )}
          {messages.map((m, i) => <AgentMessageBubble key={i} message={m} />)}
          <div ref={bottomRef} />
        </div>
      </DialogContent>
    </Dialog>
  );
}