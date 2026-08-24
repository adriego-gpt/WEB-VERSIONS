import { normalizeEntityId, sanitizeLine, sanitizeParagraph } from "../../utils/sanitizers.js";
import { normalizeUserPhoneNumber } from "../../utils/phone.js";
import { createUid } from "../../utils/uid.js";
import { MAX_ADDRESS_BOOK_ENTRIES } from "../../constants/ui.js";

export function normalizeAddressBookEntry(rawEntry = {}, fallbackId = "") {
  const address = sanitizeParagraph(rawEntry?.address || "").slice(0, 320);
  if (!address) return null;
  const normalizedId = normalizeEntityId(rawEntry?.id || fallbackId || createUid());
  return {
    id: normalizedId || createUid(),
    label: sanitizeLine(rawEntry?.label || "Dirección guardada").slice(0, 48) || "Dirección guardada",
    address,
    city: sanitizeLine(rawEntry?.city || "").slice(0, 80),
    reference: sanitizeParagraph(rawEntry?.reference || "").slice(0, 260),
    phone: normalizeUserPhoneNumber(rawEntry?.phone || ""),
    isDefault: Boolean(rawEntry?.isDefault),
    updatedAt: String(rawEntry?.updatedAt || new Date().toISOString()),
  };
}

export function normalizeAddressBook(rawAddressBook = [], options = {}) {
  const source = Array.isArray(rawAddressBook) ? rawAddressBook : [];
  const allowFallback = Boolean(options?.allowFallback);
  const fallbackAddress = sanitizeParagraph(options?.fallbackAddress || "").slice(0, 320);
  const fallbackPhone = normalizeUserPhoneNumber(options?.fallbackPhone || "");
  const deduped = [];
  const seenIds = new Set();

  source.forEach((entry, index) => {
    const normalized = normalizeAddressBookEntry(entry, `addr-${index + 1}`);
    if (!normalized) return;
    if (seenIds.has(normalized.id)) return;
    seenIds.add(normalized.id);
    deduped.push(normalized);
  });

  if (!deduped.length && allowFallback && fallbackAddress) {
    deduped.push(normalizeAddressBookEntry({
      label: "Principal",
      address: fallbackAddress,
      phone: fallbackPhone,
      isDefault: true,
    }, "addr-default"));
  }

  const clipped = deduped.slice(0, MAX_ADDRESS_BOOK_ENTRIES);
  if (!clipped.some((entry) => entry.isDefault) && clipped.length) {
    clipped[0] = { ...clipped[0], isDefault: true };
  }
  return clipped;
}

export function getDefaultAddressBookEntry(addressBook = []) {
  const normalizedBook = normalizeAddressBook(addressBook);
  if (!normalizedBook.length) return null;
  return normalizedBook.find((entry) => entry.isDefault) || normalizedBook[0] || null;
}

export function isSameAddressBookEntry(left = {}, right = {}) {
  return sanitizeParagraph(left.address || "") === sanitizeParagraph(right.address || "")
    && sanitizeLine(left.city || "") === sanitizeLine(right.city || "")
    && sanitizeParagraph(left.reference || "") === sanitizeParagraph(right.reference || "")
    && normalizeUserPhoneNumber(left.phone || "") === normalizeUserPhoneNumber(right.phone || "");
}
