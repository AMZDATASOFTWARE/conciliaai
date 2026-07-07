import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

export default function DataPagination({ page, hasMore, onPageChange, className }) {
  if (page <= 1 && !hasMore) return null;
  const go = (p) => (e) => { e.preventDefault(); if (p >= 1) onPageChange(p); };
  const disabledPrev = page <= 1;

  return (
    <Pagination className={cn("py-3", className)}>
      <PaginationContent>
        <PaginationItem>
          <PaginationLink
            href="#"
            onClick={go(page - 1)}
            aria-label="Página anterior"
            className={cn("gap-1 w-auto px-2.5", disabledPrev && "pointer-events-none opacity-40")}
          >
            <ChevronLeft className="h-4 w-4" /> <span>Anterior</span>
          </PaginationLink>
        </PaginationItem>

        {page > 1 && (
          <PaginationItem>
            <PaginationLink href="#" onClick={go(page - 1)}>{page - 1}</PaginationLink>
          </PaginationItem>
        )}

        <PaginationItem>
          <PaginationLink href="#" isActive onClick={(e) => e.preventDefault()}>{page}</PaginationLink>
        </PaginationItem>

        {hasMore && (
          <PaginationItem>
            <PaginationLink href="#" onClick={go(page + 1)}>{page + 1}</PaginationLink>
          </PaginationItem>
        )}

        <PaginationItem>
          <PaginationLink
            href="#"
            onClick={go(page + 1)}
            aria-label="Próxima página"
            className={cn("gap-1 w-auto px-2.5", !hasMore && "pointer-events-none opacity-40")}
          >
            <span>Próxima</span> <ChevronRight className="h-4 w-4" />
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}