export function pruneSelection(previous = [], allowedIds = []) {
  const allowed = allowedIds instanceof Set
    ? allowedIds
    : new Set(Array.from(allowedIds || [], (id) => String(id)));
  const next = previous.filter((id) => allowed.has(String(id)));
  return next.length === previous.length ? previous : next;
}
