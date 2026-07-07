import { base44 } from "@/api/base44Client";

// Motor de aprendizagem Human-in-the-Loop:
// quando o operador corrige uma decisão da IA, o Agente Supervisor do tenant
// gera uma nova regra de reconciliação e ela é persistida automaticamente.
export async function feedbackLoopService(originalRecord, updatedData) {
  try {
    const tenantId = originalRecord.tenant_id;
    if (!tenantId) return { learned: false, reason: "no_tenant" };

    // 1. Analisar a divergência: só aprende se houve correção relevante
    const changedCategory = updatedData.category && updatedData.category !== (originalRecord.category || "");
    const changedCC = updatedData.cost_center_id && updatedData.cost_center_id !== (originalRecord.cost_center_id || "");
    const changedResponsible = updatedData.responsible && updatedData.responsible !== (originalRecord.responsible || "");
    if (!changedCategory && !changedCC && !changedResponsible) return { learned: false, reason: "no_relevant_change" };

    const description = originalRecord.description || originalRecord.notes || updatedData.notes || "";
    if (!description) return { learned: false, reason: "no_description" };

    // 2. Contexto do Agente Supervisor deste tenant
    const supervisors = await base44.entities.TenantAgent.filter({ tenant_id: tenantId, role: "supervisor" }, "-created_date", 1);
    const supervisorInstructions = supervisors[0]?.instructions || "";

    // 3. Invocação de regra autônoma: Supervisor extrai a keyword mais segura
    const amount = typeof originalRecord.amount === "number" ? originalRecord.amount.toFixed(2) : "N/A";
    const extraction = await base44.integrations.Core.InvokeLLM({
      prompt: `${supervisorInstructions}\n\nVocê é o Agente Supervisor de conciliação financeira deste cliente. O operador humano corrigiu a sua última ação.\nOnde você classificou a transação "${description}" no valor de ${amount} como "${originalRecord.category || "sem categoria"}", o correto é "${updatedData.category || originalRecord.category || ""}"${updatedData.cost_center_id ? ` no Centro de Custo "${updatedData.cost_center_id}"` : ""}${updatedData.responsible ? ` com responsável "${updatedData.responsible}"` : ""}.\n\nGere uma nova regra de reconciliação para este padrão. Extraia da descrição a palavra-chave MAIS SEGURA e ESTÁVEL — não use a descrição inteira nem termos genéricos demais. Exemplos: "iFood Restaurante da Maria" -> "iFood"; "PIX WILSON DE CASSIO 123" -> "WILSON DE CASSIO".\nIndique também se o padrão sugere pessoa física (is_pf).`,
      response_json_schema: {
        type: "object",
        properties: {
          keyword: { type: "string" },
          is_pf: { type: "boolean" },
        },
        required: ["keyword"],
      },
    });

    const keyword = (extraction.keyword || "").trim();
    if (!keyword || keyword.length < 3) return { learned: false, reason: "weak_keyword" };

    // 4. Idempotência: não duplicar regra ativa com a mesma keyword neste tenant
    const activeRules = await base44.entities.ReconciliationRule.filter(
      { tenant_id: tenantId, is_active: true },
      "-created_date",
      500
    );
    const existing = activeRules.find((r) => (r.keyword || "").toLowerCase() === keyword.toLowerCase());

    if (existing) {
      await base44.entities.ReconciliationRule.update(existing.id, {
        map_to: updatedData.responsible || existing.map_to,
        category: updatedData.category || existing.category,
        cost_center_id: updatedData.cost_center_id || existing.cost_center_id,
      });
      return { learned: true, ruleId: existing.id, updated: true, keyword };
    }

    // 5. Persistência com rastreio de origem
    const rule = await base44.entities.ReconciliationRule.create({
      tenant_id: tenantId,
      keyword,
      map_to: updatedData.responsible || "",
      category: updatedData.category || "",
      cost_center_id: updatedData.cost_center_id || "",
      is_pf: !!extraction.is_pf,
      is_active: true,
      created_by: "system_feedback_loop",
      metadata: {
        original_description: description,
        old_category: originalRecord.category || null,
        new_category: updatedData.category || null,
        source_record_id: originalRecord.id,
      },
    });
    return { learned: true, ruleId: rule.id, updated: false, keyword };
  } catch (error) {
    console.error("Feedback Loop falhou:", error);
    return { learned: false, error: error.message };
  }
}