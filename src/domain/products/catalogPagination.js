export const DESKTOP_CATALOG_PAGE_SIZE = 12;
export const MOBILE_CATALOG_PAGE_SIZE = 8;

export function getCatalogPagination(totalItems, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.max(1, Math.min(totalPages, Math.floor(Number(page)) || 1));
  const startIndex = (currentPage - 1) * pageSize;
  const visiblePages = Math.min(5, totalPages);
  const firstPage = Math.max(1, Math.min(currentPage - 2, totalPages - visiblePages + 1));
  return {
    totalPages,
    currentPage,
    startIndex,
    endIndex: Math.min(totalItems, startIndex + pageSize),
    rangeStart: totalItems === 0 ? 0 : startIndex + 1,
    pageWindow: Array.from({ length: visiblePages }, (_, index) => firstPage + index),
  };
}
