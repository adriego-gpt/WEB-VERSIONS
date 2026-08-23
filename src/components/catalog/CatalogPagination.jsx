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
    <div className="catalog-pagination" aria-label="Paginación del catálogo">
      <button
        type="button"
        className="btn btn-outline catalog-page-btn"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
      >
        <ChevronLeft size={16} />
        Anterior
      </button>

      <div className="catalog-page-numbers">
        {pageWindow[0] > 1 && <span className="catalog-page-ellipsis">...</span>}
        {pageWindow.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            className={`catalog-page-number ${pageNumber === currentPage ? "active" : ""}`}
            onClick={() => onPageChange(pageNumber)}
            aria-current={pageNumber === currentPage ? "page" : undefined}
          >
            {pageNumber}
          </button>
        ))}
        {pageWindow[pageWindow.length - 1] < totalPages && <span className="catalog-page-ellipsis">...</span>}
      </div>

      <button
        type="button"
        className="btn btn-outline catalog-page-btn"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
      >
        Siguiente
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export default CatalogPagination;
