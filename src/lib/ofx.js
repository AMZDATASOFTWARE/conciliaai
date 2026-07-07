// Parser de arquivos OFX (extratos bancários) — suporta formato SGML/XML
export function parseOfx(text) {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  return blocks.map((block) => {
    const get = (tag) => {
      const m = block.match(new RegExp('<' + tag + '>([^<\\r\\n]*)', 'i'));
      return m ? m[1].trim() : '';
    };
    const rawDate = get('DTPOSTED');
    const date = rawDate.length >= 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : '';
    const amount = parseFloat(get('TRNAMT').replace(',', '.')) || 0;
    return {
      date,
      amount,
      description: get('MEMO') || get('NAME'),
      type: amount < 0 ? 'debit' : 'credit',
      transaction_id_ofx: get('FITID'),
    };
  }).filter((t) => t.date && t.amount !== 0);
}