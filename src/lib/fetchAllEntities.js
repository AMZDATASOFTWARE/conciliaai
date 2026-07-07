// Busca TODOS os registros que casam com a query, em lotes (para exportação,
// que precisa de todas as linhas do período — não apenas a página atual).
export async function fetchAllEntities(entity, query, sort, batch = 500) {
  let all = [];
  let skip = 0;
  let page;
  do {
    page = await entity.filter(query, sort, batch, skip);
    all = all.concat(page);
    skip += batch;
  } while (page.length === batch);
  return all;
}