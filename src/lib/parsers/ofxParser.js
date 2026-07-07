// OFX Parser (Motor Bancário Padrão) — SGML/XML
// Extrai transações de <STMTTRN>, preservando o sinal do valor e o bloco original em raw_data.

export function parseOfxFile(text) {
  if (!text || !/<OFX>|<STMTTRN>/i.test(text)) {
    throw new Error('Arquivo OFX inválido: estrutura não reconhecida.');
  }
  const blocks = text.split(new RegExp('<STMTTRN>', 'i')).slice(1);
  if (blocks.length === 0) {
    throw new Error('Arquivo OFX inválido: nenhuma transação (<STMTTRN>) encontrada.');
  }

  const txns = blocks.map((rawBlock) => {
    const block = rawBlock.split(new RegExp('</STMTTRN>', 'i'))[0];
    const get = (tag) => {
      const m = block.match(new RegExp('<' + tag + '>([^<\\r\\n]*)', 'i'));
      return m ? m[1].trim() : '';
    };

    const rawDate = get('DTPOSTED');
    const date = rawDate.length >= 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : '';
    const amount = parseFloat(get('TRNAMT').replace(',', '.'));
    const trnType = get('TRNTYPE').toUpperCase();
    const type = trnType === 'DEBIT' ? 'debit'
      : trnType === 'CREDIT' ? 'credit'
      : amount < 0 ? 'debit' : 'credit';

    return {
      date,
      amount, // sinal preservado: débitos negativos
      type,
      description: get('MEMO') || get('NAME'),
      transaction_id_ofx: get('FITID'),
      raw_data: { ofx_block: block.trim() },
    };
  }).filter((t) => t.date && !isNaN(t.amount));

  if (txns.length === 0) {
    throw new Error('Arquivo OFX inválido: nenhuma transação com data e valor válidos.');
  }
  return txns;
}