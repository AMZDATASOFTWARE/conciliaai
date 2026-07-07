import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// Paginação no servidor via limit + skip do SDK.
// Busca pageSize + 1 registros para detectar se existe próxima página
// sem precisar carregar a contagem total (evita puxar milhares de linhas).
export function usePaginatedEntity(entityName, query, sort, pageSize = 100) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const queryKey = JSON.stringify(query);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await base44.entities[entityName].filter(
      query,
      sort,
      pageSize + 1,
      (page - 1) * pageSize
    );
    setHasMore(res.length > pageSize);
    setItems(res.slice(0, pageSize));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityName, queryKey, sort, pageSize, page]);

  useEffect(() => { load(); }, [load]);

  // Volta para a página 1 quando os filtros (query) mudam
  useEffect(() => { setPage(1); }, [queryKey]);

  return { items, page, setPage, hasMore, loading, reload: load };
}