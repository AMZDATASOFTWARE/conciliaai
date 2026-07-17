import { base44 } from "@/api/base44Client";

// Motor de aprendizagem Human-in-the-Loop:
// quando o operador corrige uma decisão da IA, o Agente Supervisor do tenant
// gera uma nova regra de reconciliação. Fase 6 do plano de precisão cirúrgica:
// regras aprendidas pela IA NÃO entram ativas direto — nascem com
// approval_status "pending_review" (is_active:false) e só passam a valer
// depois de um humano aprovar em Dicionário. Isso evita que uma extração de
// keyword ruim vire regra ativa sem ninguém perceber.

function normalizeKeyword(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Levenshtein simples — só precisa de "quão parecido", não da edit-list em si.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const na = normalizeKeyword(a);
  const nb = normalizeKeyword(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}

const SIMILARITY_THRESHOLD = 0.85;
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

    // 4. Idempotência + dedup fuzzy: não duplicar (nem quase-duplicar) uma regra
    // deste tenant, esteja ela ativa OU ainda pendente de aprovação.
    const allTenantRules = await base44.entities.ReconciliationRule.filter(
      { tenant_id: tenantId },
      "-created_date",
      500
    );
    const exact = allTenantRules.find((r) => (r.keyword || "").toLowerCase() === keyword.toLowerCase());

    if (exact) {
      // Só atualiza regras já aprovadas automaticamente; uma pendente/rejeitada
      // continua exigindo revisão humana explicita, não é "promovida" por tabela.
      if (exact.approval_status === "approved" || exact.is_active) {
        await base44.entities.ReconciliationRule.update(exact.id, {
          map_to: updatedData.responsible || exact.map_to,
          category: updatedData.category || exact.category,
          cost_center_id: updatedData.cost_center_id || exact.cost_center_id,
        });
        return { learned: true, ruleId: exact.id, updated: true, keyword };
      }
      return { learned: false, reason: "duplicate_pending_review", ruleId: exact.id };
    }

    const near = allTenantRules.find((r) => similarity(r.keyword, keyword) >= SIMILARITY_THRESHOLD);
    if (near) {
      return { learned: false, reason: "similar_rule_exists", ruleId: near.id, similarKeyword: near.keyword };
    }

    // 5. Persistência com rastreio de origem — nasce pendente de aprovação humana
    const rule = await base44.entities.ReconciliationRule.create({
      tenant_id: tenantId,
      keyword,
      map_to: updatedData.responsible || "",
      category: updatedData.category || "",
      cost_center_id: updatedData.cost_center_id || "",
      is_pf: !!extraction.is_pf,
      is_active: false,
      approval_status: "pending_review",
      created_by: "system_feedback_loop",
      metadata: {
        original_description: description,
        old_category: originalRecord.category || null,
        new_category: updatedData.category || null,
        source_record_id: originalRecord.id,
      },
    });
    return { learned: true, ruleId: rule.id, updated: false, keyword, pendingApproval: true };
  } catch (error) {
    console.error("Feedback Loop falhou:", error);
    return { learned: false, error: error.message };
  }
}