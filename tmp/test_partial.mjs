import { run3WayReconciliation } from '/app/src/lib/reconcile3way.js';

// Cenário: caixa bate com a soma bruta da maquininha (etapa 1 fecha), mas nenhum
// BankTransaction bate com o líquido esperado do lote (etapa 2 falha) -> deve
// gerar um registro "partial", não sumir silenciosamente.
const cashTxs = [
  { id: 'cash1', tenant_id: 't1', date: '2026-06-01', amount: 100, payment_method: 'Cartão de Débito' },
];
const acquirerSettlements = [
  { id: 'acq1', sale_date: '2026-06-01', settlement_date: '2026-06-02', card_type: 'debit', card_brand: 'Visa', gross_amount: 100, fee_amount: 3, net_amount: 97, batch_reference: 'LOTE1' },
];
const bankTxs = [
  // Nenhum banco bate com 97 -> etapa 2 falha de propósito
  { id: 'bank1', tenant_id: 't1', date: '2026-06-03', type: 'credit', amount: 500, description: 'outra coisa' },
];

const result = run3WayReconciliation({ bankTxs, cashTxs, acquirerSettlements });
console.log(JSON.stringify(result, null, 2));

const partial = result.records.find(r => r.status === 'partial');
if (!partial) { console.error('FALHOU: nenhum registro partial gerado'); process.exit(1); }
if (result.usedCashIds.size !== 0) { console.error('FALHOU: cash não deveria estar em usedCashIds (só partial, não reconciled)'); process.exit(1); }
if (result.usedBankIds.size !== 0) { console.error('FALHOU: bank não deveria estar em usedBankIds'); process.exit(1); }
console.log('OK: registro partial gerado corretamente, sets finais vazios (nada marcado reconciled à toa)');

// Segundo teste: cadeia completa (etapa 1 + etapa 2 fecham) continua funcionando
const bankTxs2 = [{ id: 'bank2', tenant_id: 't1', date: '2026-06-02', type: 'credit', amount: 97, description: 'liquidação' }];
const result2 = run3WayReconciliation({ bankTxs, cashTxs, acquirerSettlements: acquirerSettlements, });
const result3 = run3WayReconciliation({ bankTxs: bankTxs2, cashTxs, acquirerSettlements });
const closed = result3.records.find(r => r.status === 'reconciled');
if (!closed) { console.error('FALHOU: cadeia completa deveria fechar como reconciled'); process.exit(1); }
if (!result3.usedCashIds.has('cash1') || !result3.usedBankIds.has('bank2') || !result3.usedAcquirerIds.has('acq1')) {
  console.error('FALHOU: sets finais incompletos para cadeia fechada'); process.exit(1);
}
console.log('OK: cadeia completa ainda fecha normalmente como reconciled');
