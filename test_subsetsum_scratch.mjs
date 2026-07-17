import { findSubsetSumMatch } from './src/lib/subsetSumMatch.js';
import { run3WayReconciliation } from './src/lib/reconcile3way.js';

// Teste 1: subset simples — 3 de 5 itens somam o alvo
const items = [
  { id: 'a', amount: 10 },
  { id: 'b', amount: 25.5 },
  { id: 'c', amount: 7.3 },
  { id: 'd', amount: 100 }, // não deve entrar
  { id: 'e', amount: 4.2 },
];
// a + b + c + e = 10 + 25.5 + 7.3 + 4.2 = 47.0
const subset = findSubsetSumMatch(items, 47.0, 'amount', 0.05);
if (!subset) { console.error('FALHOU teste 1: nenhum subset encontrado'); process.exit(1); }
const ids = subset.map(s => s.id).sort().join(',');
if (ids !== 'a,b,c,e') { console.error('FALHOU teste 1: subset errado ->', ids); process.exit(1); }
console.log('OK teste 1: subset correto encontrado ->', ids);

// Teste 2: nenhum subset fecha
const noMatch = findSubsetSumMatch(items, 999, 'amount', 0.05);
if (noMatch !== null) { console.error('FALHOU teste 2: deveria retornar null'); process.exit(1); }
console.log('OK teste 2: retorna null quando nada fecha');

// Teste 3: integração no motor de 3 pontas — 4 linhas de maquininha no mesmo dia,
// mas só 3 delas (uma bandeira misturada por engano) fecham com o caixa.
const cashTxs = [{ id: 'cash1', tenant_id: 't1', date: '2026-06-05', amount: 150, payment_method: 'Cartão de Débito' }];
const acquirerSettlements = [
  { id: 's1', sale_date: '2026-06-05', settlement_date: '2026-06-06', card_type: 'debit', card_brand: 'Visa', gross_amount: 50, fee_amount: 1.5, net_amount: 48.5, batch_reference: 'L1' },
  { id: 's2', sale_date: '2026-06-05', settlement_date: '2026-06-06', card_type: 'debit', card_brand: 'Visa', gross_amount: 60, fee_amount: 1.8, net_amount: 58.2, batch_reference: 'L1' },
  { id: 's3', sale_date: '2026-06-05', settlement_date: '2026-06-06', card_type: 'debit', card_brand: 'Master', gross_amount: 40, fee_amount: 1.2, net_amount: 38.8, batch_reference: 'L1' },
  { id: 's4', sale_date: '2026-06-05', settlement_date: '2026-06-06', card_type: 'debit', card_brand: 'Elo', gross_amount: 999, fee_amount: 30, net_amount: 969, batch_reference: 'L2' }, // sobra, não faz parte do fechamento de caixa deste dia
];
// s1+s2+s3 = 150 (bate com o caixa). Soma de TODAS (150+999=1149) não bate.
const bankTxs = [{ id: 'bank1', tenant_id: 't1', date: '2026-06-07', type: 'credit', amount: 145.5, description: 'liquidação lote L1' }]; // 48.5+58.2+38.8=145.5

const result = run3WayReconciliation({ bankTxs, cashTxs, acquirerSettlements });
console.log(JSON.stringify(result.records, null, 2));
const closed = result.records.find(r => r.status === 'reconciled');
if (!closed) { console.error('FALHOU teste 3: cadeia via subset deveria ter fechado'); process.exit(1); }
const usedIds = closed.acquirer_settlement_ids.slice().sort().join(',');
if (usedIds !== 's1,s2,s3') { console.error('FALHOU teste 3: settlements usados errados ->', usedIds); process.exit(1); }
if (result.usedAcquirerIds.has('s4')) { console.error('FALHOU teste 3: s4 não deveria ter sido usado'); process.exit(1); }
console.log('OK teste 3: motor de 3 pontas fecha via subconjunto (s1+s2+s3), ignora s4 corretamente');
