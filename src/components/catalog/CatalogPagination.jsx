import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function CatalogPagination({
  currentPage,
  totalPages,
  pageWindow,
  onPageChange,
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="catalog-pagination" aria-label="Paginación del catálogo">
      <button
        type="button"
        className="btn btn-outline catalog-page-btn"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        aria-controls="catalog-results"
      >
        <ChevronLeft size={16} />
        Anterior
      </button>

      <div className="catalog-page-numbers">
        {pageWindow[0] > 1 && <button type="button" className="catalog-page-number" onClick={() => onPageChange(1)} aria-label="Ir a la página 1" aria-controls="catalog-results">1</button>}
        {pageWindow[0] > 2 && <span className="catalog-page-ellipsis" aria-hidden="true">…</span>}
        {pageWindow.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            className={`catalog-page-number ${pageNumber === currentPage ? "active" : ""}`}
            onClick={() => onPageChange(pageNumber)}
            aria-current={pageNumber === currentPage ? "page" : undefined}
            aria-label={`Ir a la página ${pageNumber}`}
            aria-controls="catalog-results"
          >
            {pageNumber}
          </button>
        ))}
        {pageWindow[pageWindow.length - 1] < totalPages - 1 && <span className="catalog-page-ellipsis" aria-hidden="true">…</span>}
        {pageWindow[pageWindow.length - 1] < totalPages && <button type="button" className="catalog-page-number" onClick={() => onPageChange(totalPages)} aria-label={`Ir a la página ${totalPages}`} aria-controls="catalog-results">{totalPages}</button>}
      </div>

      <button
        type="button"
        className="btn btn-outline catalog-page-btn"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        aria-controls="catalog-results"
      >
        Siguiente
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

export default CatalogPagination;
