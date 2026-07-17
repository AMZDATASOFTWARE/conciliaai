// Fase 7.4 — fallback de subset-sum com programação dinâmica, inspirado no paper
// "The Subset Sum Matching Problem" (arXiv 2508.19218). Usado quando o agrupamento
// guloso do motor de 3 pontas (somar TODAS as linhas de maquininha do dia) não fecha
// com nenhum lançamento de caixa — tenta achar um SUBCONJUNTO das linhas disponíveis
// cuja soma bate com o valor alvo dentro da tolerância, em vez de desistir.

const TOLERANCE_DEFAULT = 0.05;

// Escala valores em reais para centavos inteiros — a DP de subset-sum clássica só
// funciona de forma prática sobre inteiros; a tolerância também é escalada.
const toCents = (n) => Math.round(n * 100);

// Encontra um subconjunto de `items` (cada um com um campo numérico `amountField`)
// cuja soma cai dentro de `tolerance` do `targetAmount`. Retorna o subconjunto de
// itens (não os índices) ou null se nenhum subconjunto fechar.
// Complexidade O(n · maxSum) tempo/espaço — pseudo-polinomial, igual à variante DP
// do paper (prática para o volume de um dia de vendas, não para o dataset inteiro).
export function findSubsetSumMatch(items, targetAmount, amountField = "amount", tolerance = TOLERANCE_DEFAULT) {
  if (!items || !items.length) return null;
  const targetCents = toCents(targetAmount);
  const toleranceCents = Math.max(1, toCents(tolerance));
  const maxSum = targetCents + toleranceCents;
  if (maxSum <= 0) return null;

  // dp.get(s) = { itemIndex, prevSum } — o último item usado para alcançar a soma
  // `s` e a soma anterior, para permitir o backtracking do subconjunto escolhido.
  // Soma 0 (subconjunto vazio) sempre existe como ponto de partida, com valor null.
  const dp = new Map();
  dp.set(0, null);

  for (let i = 0; i < items.length; i++) {
    const amt = toCents(items[i][amountField]);
    if (amt <= 0 || amt > maxSum) continue;
    // Snapshot das somas já alcançadas ANTES deste item, para não reusar o mesmo
    // item duas vezes na mesma passada (subset-sum 0/1, sem repetição).
    const existingSums = [...dp.keys()];
    for (const s of existingSums) {
      const next = s + amt;
      if (next > maxSum || dp.has(next)) continue;
      dp.set(next, { itemIndex: i, prevSum: s });
    }
  }

  let bestSum = null;
  let bestDiff = Infinity;
  for (const s of dp.keys()) {
    if (s === 0) continue;
    const diff = Math.abs(s - targetCents);
    if (diff <= toleranceCents && diff < bestDiff) {
      bestDiff = diff;
      bestSum = s;
    }
  }
  if (bestSum === null) return null;

  const chosenIndexes = [];
  let cur = bestSum;
  while (cur !== 0 && cur !== null) {
    const node = dp.get(cur);
    if (!node) break;
    chosenIndexes.push(node.itemIndex);
    cur = node.prevSum;
  }
  return chosenIndexes.map((idx) => items[idx]);
}
