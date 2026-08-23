import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getReadyBankAccounts,
  normalizeBankAccounts,
  paymentSettingsMatch,
  withBankAccounts,
} from "../../src/domain/contact/paymentSettings.js";
import { enqueueAsyncOperation } from "../../src/utils/asyncQueue.js";
import { sanitizeContactSettings } from "../../api/_lib/storeSanitizers.js";

test("la cola serializa el guardado de contacto después de sincronizaciones anteriores", async () => {
  const events = [];
  const queueRef = { current: Promise.resolve() };

  const catalogSync = enqueueAsyncOperation(queueRef, async () => {
    events.push("catalog-start");
    await new Promise((resolve) => setTimeout(resolve, 10));
    events.push("catalog-end");
  });
  const contactSync = enqueueAsyncOperation(queueRef, async () => {
    events.push("contact-start");
    events.push("contact-end");
  });

  await Promise.all([catalogSync, contactSync]);
  assert.deepEqual(events, ["catalog-start", "catalog-end", "contact-start", "contact-end"]);
});

test("la verificación detecta si el servidor descartó el QR o la cuenta", () => {
  const expected = {
    bankName: "Banco Prueba",
    accountType: "Ahorros",
    accountNumber: "1234567890",
    accountHolder: "Adriego Store",
    accountId: "0999999999",
    bankLogoImage: "data:image/png;base64,AA==",
    bankQrImage: "data:image/png;base64,AA==",
    cardFeePercent: 6,
  };

  assert.equal(paymentSettingsMatch(expected, { ...expected }), true);
  assert.equal(paymentSettingsMatch(expected, { ...expected, bankQrImage: "" }), false);
  assert.equal(paymentSettingsMatch(expected, { ...expected, accountNumber: "" }), false);
});

test("múltiples cuentas conservan compatibilidad y solo publican las completas", () => {
  const settings = withBankAccounts({ cardFeePercent: 6 }, [
    {
      id: "bank-pichincha",
      bankName: "Banco Pichincha",
      accountType: "Ahorros",
      accountNumber: "111111",
      accountHolder: "Adriego Store",
      accountId: "0999999999",
      bankLogoImage: "data:image/png;base64,AA==",
      bankQrImage: "data:image/png;base64,AA==",
    },
    {
      id: "bank-guayaquil",
      bankName: "Banco Guayaquil",
      accountType: "Corriente",
      accountNumber: "222222",
      accountHolder: "Adriego Store",
      accountId: "",
      bankLogoImage: "",
      bankQrImage: "",
    },
  ]);

  assert.equal(normalizeBankAccounts(settings).length, 2);
  assert.equal(getReadyBankAccounts(settings).length, 1);
  assert.equal(settings.bankName, "Banco Pichincha", "la primera cuenta se refleja en los campos heredados");
  assert.equal(settings.bankLogoImage, "data:image/png;base64,AA==");
  assert.equal(paymentSettingsMatch(settings, { ...settings, bankAccounts: settings.bankAccounts.map((account) => ({ ...account })) }), true);
  assert.equal(paymentSettingsMatch(settings, { ...settings, bankAccounts: [...settings.bankAccounts].reverse() }), false);
});

test("el borrador bancario conserva espacios mientras el administrador escribe", () => {
  const settings = withBankAccounts({ cardFeePercent: 6 }, [{
    id: "bank-draft",
    bankName: "Banco ",
    accountType: "Ahorros",
    accountNumber: "123456",
    accountHolder: "María ",
    accountId: "",
    bankQrImage: "",
  }]);

  assert.equal(settings.bankAccounts[0].bankName, "Banco ");
  assert.equal(settings.bankAccounts[0].accountHolder, "María ");
  assert.equal(normalizeBankAccounts(settings)[0].bankName, "Banco");
  assert.equal(normalizeBankAccounts(settings)[0].accountHolder, "María");
});

test("guardar permanece bloqueado mientras el QR todavía se procesa", async () => {
  const appSource = await readFile(new URL("../../src/App.jsx", import.meta.url), "utf8");
  const panelSource = await readFile(new URL("../../src/components/admin/AdminPanelModal.jsx", import.meta.url), "utf8");

  assert.match(appSource, /if \(contactSaveBusy \|\| bankQrUploadBusy\) return;/);
  assert.match(panelSource, /disabled=\{contactSaveBusy \|\| bankQrUploadBusy\}/);
});

test("una verificación incompleta no reemplaza el borrador con una sola cuenta", async () => {
  const appSource = await readFile(new URL("../../src/App.jsx", import.meta.url), "utf8");
  const mismatchStart = appSource.indexOf("El servidor no confirmó todas las cuentas bancarias");
  const mismatchEnd = appSource.indexOf("return;", mismatchStart);
  const mismatchBranch = appSource.slice(mismatchStart, mismatchEnd);

  assert.ok(mismatchStart >= 0, "debe existir la verificación de persistencia bancaria");
  assert.match(mismatchBranch, /setContactDraft\(nextContactSettings\)/);
  assert.doesNotMatch(mismatchBranch, /setContactDraft\(verifiedContactSettings\)/);
});

test("el guardado valida primero la respuesta autoritativa que acaba de persistir los bancos", async () => {
  const appSource = await readFile(new URL("../../src/App.jsx", import.meta.url), "utf8");
  const saveStart = appSource.indexOf("const saveContactConfiguration = async () =>");
  const saveEnd = appSource.indexOf("const saveStoreConfiguration = async () =>", saveStart);
  const saveBranch = appSource.slice(saveStart, saveEnd);

  assert.ok(saveStart >= 0 && saveEnd > saveStart, "debe encontrarse el flujo de guardado de contacto");
  assert.match(saveBranch, /syncResult\.data\?\.contactSettings/);
  assert.doesNotMatch(saveBranch, /const verificationResult = await getCatalogState/);
});

test("el servidor conserva un logo bancario optimizado cercano al límite permitido", () => {
  const nearLimitLogo = `data:image/png;base64,${Buffer.alloc(360 * 1024, 1).toString("base64")}`;
  const settings = sanitizeContactSettings({
    paymentSettings: {
      bankAccounts: [{
        id: "bank-large-logo",
        bankName: "Banco Prueba",
        accountType: "Ahorros",
        accountNumber: "123456789",
        accountHolder: "Titular Prueba",
        accountId: "0999999999",
        bankLogoImage: nearLimitLogo,
        bankQrImage: "data:image/png;base64,AA==",
      }],
    },
  });

  assert.equal(settings.paymentSettings.bankAccounts[0].bankLogoImage, nearLimitLogo);
  assert.equal(settings.paymentSettings.bankLogoImage, nearLimitLogo);
});
