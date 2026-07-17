import { run3WayReconciliation } from './src/lib/reconcile3way.js';

const cashTxs = [
  { id: 'cash1', tenant_id: 't1', date: '2026-06-01', amount: 100, payment_method: 'Cartão de Débito' },
];
const acquirerSettlements = [
  { id: 'acq1', sale_date: '2026-06-01', settlement_date: '2026-06-02', card_type: 'debit', card_brand: 'Visa', gross_amount: 100, fee_amount: 3, net_amount: 97, batch_reference: 'LOTE1' },
];
const bankTxsNoMatch = [
  { id: 'bank1', tenant_id: 't1', date: '2026-06-03', type: 'credit', amount: 500, description: 'outra coisa' },
];

const result = run3WayReconciliation({ bankTxs: bankTxsNoMatch, cashTxs, acquirerSettlements });
console.log(JSON.stringify(result, null, 2));

const partial = result.records.find(r => r.status === 'partial');
if (!partial) { console.error('FALHOU: nenhum registro partial gerado'); process.exit(1); }
if (result.usedCashIds.size !== 0) { console.error('FALHOU: cash não deveria estar em usedCashIds'); process.exit(1); }
if (result.usedBankIds.size !== 0) { console.error('FALHOU: bank não deveria estar em usedBankIds'); process.exit(1); }
console.log('OK teste 1: registro partial gerado, sets finais vazios');

const bankTxsMatch = [{ id: 'bank2', tenant_id: 't1', date: '2026-06-02', type: 'credit', amount: 97, description: 'liquidação' }];
const result2 = run3WayReconciliation({ bankTxs: bankTxsMatch, cashTxs, acquirerSettlements });
const closed = result2.records.find(r => r.status === 'reconciled');
if (!closed) { console.error('FALHOU: cadeia completa deveria fechar como reconciled'); process.exit(1); }
if (!result2.usedCashIds.has('cash1') || !result2.usedBankIds.has('bank2') || !result2.usedAcquirerIds.has('acq1')) {
  console.error('FALHOU: sets finais incompletos para cadeia fechada'); process.exit(1);
}
console.log('OK teste 2: cadeia completa ainda fecha normalmente como reconciled');

// Idempotência: se cash1 já está em partialCashIds, não deve gerar de novo
const result3 = run3WayReconciliation({ bankTxs: bankTxsNoMatch, cashTxs, acquirerSettlements, partialCashIds: new Set(['cash1']) });
if (result3.records.length !== 0) { console.error('FALHOU: partialCashIds deveria bloquear reprocessamento'); process.exit(1); }
console.log('OK teste 3: partialCashIds impede regerar o mesmo partial');
