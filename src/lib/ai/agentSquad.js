// Agent Factory — arquitetura "Squad por Tenant".
// Cada tenant possui uma conversa dedicada e persistente com o Agente Analista Financeiro:
// memória, histórico e decisões ficam 100% isolados do squad de qualquer outro tenant.
import { base44 } from '@/api/base44Client';

const AGENT_NAME = 'analista_financeiro';

// Evoca o Squad exclusivo do tenant: reutiliza a instância existente ou instancia uma nova.
export async function getOrCreateSquadConversation(tenantId, tenantName) {
  const conversations = await base44.agents.listConversations({ agent_name: AGENT_NAME });
  const existing = (conversations || []).find(
    (c) => c.metadata?.tenant_id === tenantId || c.metadata?.name === squadName(tenantId, tenantName)
  );
  if (existing) return existing;
  return await base44.agents.createConversation({
    agent_name: AGENT_NAME,
    metadata: {
      name: squadName(tenantId, tenantName),
      description: `Equipe exclusiva de conciliação IA do tenant ${tenantId}`,
      tenant_id: tenantId,
    },
  });
}

function squadName(tenantId, tenantName) {
  return `Squad Financeiro — ${tenantName || tenantId}`;
}

// Dispara a conciliação no Squad dedicado do tenant.
export async function triggerSquadReconciliation(conversation, tenantId) {
  await base44.agents.addMessage(conversation, {
    role: 'user',
    content:
      `Execute agora a conciliação completa para o tenant_id "${tenantId}". ` +
      `Você é o analista exclusivo deste cliente: leia primeiro a memória (TenantMemoryContext) e as regras ativas (ReconciliationRule) dele, ` +
      `depois analise todas as BankTransaction e CashTransaction com status "pending" (use o raw_data para contexto oculto), ` +
      `persista os ReconciledRecord com ai_reasoning obrigatório, atualize os status e apresente o resumo final.`,
  });
}