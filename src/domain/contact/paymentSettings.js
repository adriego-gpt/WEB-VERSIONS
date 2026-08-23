const PAYMENT_SETTING_FIELDS = [
  "bankName",
  "accountType",
  "accountNumber",
  "accountHolder",
  "accountId",
  "bankLogoImage",
  "bankQrImage",
];

export const MAX_BANK_ACCOUNTS = 8;

function normalizeBankAccount(rawAccount = {}, fallbackId = "", options = {}) {
  const preserveWhitespace = Boolean(options?.preserveWhitespace);
  const normalizeText = (value = "") => (
    preserveWhitespace ? String(value || "") : String(value || "").trim()
  );
  return {
    id: String(rawAccount?.id || fallbackId || "").trim(),
    bankName: normalizeText(rawAccount?.bankName),
    accountType: normalizeText(rawAccount?.accountType || "Ahorros") || "Ahorros",
    accountNumber: normalizeText(rawAccount?.accountNumber),
    accountHolder: normalizeText(rawAccount?.accountHolder),
    accountId: normalizeText(rawAccount?.accountId),
    bankLogoImage: normalizeText(rawAccount?.bankLogoImage),
    bankQrImage: normalizeText(rawAccount?.bankQrImage),
  };
}

export function normalizeBankAccounts(paymentSettings = {}, options = {}) {
  const keepEmpty = Boolean(options?.keepEmpty);
  const hasAccountsArray = Array.isArray(paymentSettings?.bankAccounts);
  const source = hasAccountsArray
    ? paymentSettings.bankAccounts
    : [paymentSettings];

  return source
    .slice(0, MAX_BANK_ACCOUNTS)
    .map((account, index) => normalizeBankAccount(account, `bank-${index + 1}`, options))
    .filter((account) => keepEmpty || (
      account.bankName
      || account.accountNumber
      || account.accountHolder
      || account.accountId
      || account.bankLogoImage
      || account.bankQrImage
    ));
}

export function isBankAccountReady(account = {}) {
  return Boolean(
    String(account?.bankName || "").trim()
    && String(account?.accountNumber || "").trim()
    && String(account?.accountHolder || "").trim()
    && String(account?.bankQrImage || "").trim(),
  );
}

export function getReadyBankAccounts(paymentSettings = {}) {
  return normalizeBankAccounts(paymentSettings).filter(isBankAccountReady);
}

export function withBankAccounts(paymentSettings = {}, bankAccounts = []) {
  const normalizedAccounts = normalizeBankAccounts(
    { bankAccounts },
    { keepEmpty: true, preserveWhitespace: true },
  );
  const primaryAccount = normalizedAccounts[0] || {};
  return {
    ...paymentSettings,
    bankAccounts: normalizedAccounts,
    ...Object.fromEntries(PAYMENT_SETTING_FIELDS.map((field) => [field, primaryAccount[field] || ""])),
  };
}

export function paymentSettingsMatch(expected = {}, actual = {}) {
  const expectedAccounts = normalizeBankAccounts(expected);
  const actualAccounts = normalizeBankAccounts(actual);
  if (expectedAccounts.length !== actualAccounts.length) return false;
  const accountsMatch = expectedAccounts.every((expectedAccount, index) => {
    const actualAccount = actualAccounts[index] || {};
    return ["id", ...PAYMENT_SETTING_FIELDS].every((field) => (
      String(expectedAccount?.[field] || "").trim() === String(actualAccount?.[field] || "").trim()
    ));
  });
  if (!accountsMatch) return false;

  return Number(expected?.cardFeePercent || 0) === Number(actual?.cardFeePercent || 0);
}
