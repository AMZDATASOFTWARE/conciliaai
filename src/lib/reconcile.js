// Motor de conciliação por regras do dicionário
export function matchRule(description, rules) {
  const desc = (description || '').toUpperCase();
  return rules.find(
    (r) => r.is_active !== false && r.keyword && desc.includes(r.keyword.toUpperCase())
  ) || null;
}

export function buildReasoning(rule, description) {
  if (rule) {
    return `A palavra-chave "${rule.keyword}" foi encontrada na descrição original "${description}". Regra do dicionário aplicada: mapeado para "${rule.map_to || '—'}", categoria "${rule.category || '—'}"${rule.is_pf ? ', identificado como Pessoa Física' : ''}.`;
  }
  return `Nenhuma regra do dicionário correspondeu à descrição "${description}". Registro marcado como pendente para revisão manual ou análise futura do Squad de IA.`;
}