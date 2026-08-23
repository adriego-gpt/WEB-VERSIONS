import React, { useMemo, useState } from "react";
import { ChevronDown, Landmark, Plus, Trash2, Upload, ZoomIn } from "lucide-react";
import { MAX_BANK_ACCOUNTS, isBankAccountReady, normalizeBankAccounts, withBankAccounts } from "../../domain/contact/paymentSettings";
import { FILE_SECURITY } from "../../constants";
import { createUid, normalizeImageSource, sanitizeLine } from "../../utils";
import { ImageLightbox } from "../ui/ImageLightbox";
import { AdminSectionHeader } from "./AdminSectionHeader";

export function BankAccountsPanel({
  contactDraft,
  setContactDraft,
  saveContactConfiguration,
  contactSaveBusy,
  bankQrUploadBusy,
  contactSyncFeedback,
  handleBankImageUpload,
  requestDestructiveConfirmation,
}) {
  const accounts = useMemo(
    () => normalizeBankAccounts(
      contactDraft?.paymentSettings || {},
      { keepEmpty: true, preserveWhitespace: true },
    ),
    [contactDraft?.paymentSettings],
  );
  const readyCount = accounts.filter(isBankAccountReady).length;
  const [previewAccountId, setPreviewAccountId] = useState("");
  const [expandedAccountId, setExpandedAccountId] = useState("");
  const previewAccount = accounts.find((account) => account.id === previewAccountId) || null;

  const updateAccounts = (updater) => {
    setContactDraft((previous) => {
      const previousPaymentSettings = previous?.paymentSettings || {};
      const previousAccounts = normalizeBankAccounts(
        previousPaymentSettings,
        { keepEmpty: true, preserveWhitespace: true },
      );
      const nextAccounts = typeof updater === "function" ? updater(previousAccounts) : updater;
      return {
        ...previous,
        paymentSettings: withBankAccounts(previousPaymentSettings, nextAccounts),
      };
    });
  };

  const addBankAccount = () => {
    if (accounts.length >= MAX_BANK_ACCOUNTS) return;
    const accountId = `bank-${createUid()}`;
    updateAccounts((previous) => [
      ...previous,
      {
        id: accountId,
        bankName: "",
        accountType: "Ahorros",
        accountNumber: "",
        accountHolder: "",
        accountId: "",
        bankLogoImage: "",
        bankQrImage: "",
      },
    ]);
    setExpandedAccountId(accountId);
  };

  const updateBankAccount = (accountId, field, value) => {
    updateAccounts((previous) => previous.map((account) => (
      account.id === accountId ? { ...account, [field]: value } : account
    )));
  };

  const removeBankAccount = async (account) => {
    const confirmed = await requestDestructiveConfirmation?.({
      title: `¿Quitar ${sanitizeLine(account.bankName || "esta cuenta bancaria")}?`,
      description: "La cuenta dejará de aparecer en el pago cuando guardes los cambios.",
    });
    if (!confirmed) return;
    updateAccounts((previous) => previous.filter((entry) => entry.id !== account.id));
    if (expandedAccountId === account.id) setExpandedAccountId("");
  };

  return (
    <div className="admin-tab-panel">
      <div className="card admin-general-card bank-accounts-panel">
        <AdminSectionHeader
          title="Cuentas bancarias"
          description="Administra las cuentas disponibles para transferencias. El cliente podrá elegir un banco antes de confirmar el pedido."
          actions={(
            <button type="button" className="btn btn-soft" onClick={addBankAccount} disabled={accounts.length >= MAX_BANK_ACCOUNTS}>
              <Plus size={16} />Agregar cuenta
            </button>
          )}
        />

        <div className="bank-accounts-summary" aria-live="polite">
          <Landmark size={18} aria-hidden="true" />
          <div>
            <strong>{accounts.length} {accounts.length === 1 ? "cuenta configurada" : "cuentas configuradas"}</strong>
            <span>{readyCount} {readyCount === 1 ? "lista" : "listas"} para recibir transferencias · máximo {MAX_BANK_ACCOUNTS}</span>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="bank-accounts-empty">
            <Landmark size={28} aria-hidden="true" />
            <strong>Aún no hay cuentas bancarias</strong>
            <p>Agrega la primera cuenta para habilitar transferencias en el pago.</p>
            <button type="button" className="btn btn-primary" onClick={addBankAccount}><Plus size={16} />Agregar primera cuenta</button>
          </div>
        ) : (
          <div className="bank-account-editor-list">
            {accounts.map((account, index) => {
              const ready = isBankAccountReady(account);
              const isExpanded = expandedAccountId === account.id;
              const logoImage = normalizeImageSource(account.bankLogoImage || "");
              const qrImage = normalizeImageSource(account.bankQrImage || "");
              const accountTitle = sanitizeLine(account.bankName || `Cuenta bancaria ${index + 1}`);
              return (
                <section className={`bank-account-editor${isExpanded ? " is-expanded" : ""}`} key={account.id} aria-labelledby={`bank-account-title-${account.id}`}>
                  <button
                    type="button"
                    className="bank-account-editor-head"
                    aria-expanded={isExpanded}
                    aria-controls={`bank-account-body-${account.id}`}
                    onClick={() => setExpandedAccountId((current) => current === account.id ? "" : account.id)}
                  >
                    <div className="bank-account-editor-identity">
                      <span className="bank-account-admin-logo" aria-hidden="true">
                        {logoImage ? <img src={logoImage} alt="" /> : <Landmark size={20} />}
                      </span>
                      <div>
                        <h4 id={`bank-account-title-${account.id}`}>{accountTitle}</h4>
                        <p>{account.accountNumber ? `${account.accountType || "Cuenta"} · ${account.accountNumber}` : "Completa los datos para publicarla"}</p>
                      </div>
                    </div>
                    <div className="bank-account-editor-actions">
                      <span className={`badge ${ready ? "badge-light" : "badge-warning"}`}>{ready ? "Lista" : "Incompleta"}</span>
                      <ChevronDown className="bank-account-editor-chevron" size={18} aria-hidden="true" />
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="bank-account-editor-body" id={`bank-account-body-${account.id}`}>
                      <div className="bank-account-editor-toolbar">
                        <span>Editando {accountTitle}</span>
                        <button type="button" className="btn btn-outline" onClick={() => { void removeBankAccount(account); }}>
                          <Trash2 size={15} />Quitar cuenta
                        </button>
                      </div>

                      <div className="bank-account-fields">
                    <label className="entity-field">
                      <span>Banco</span>
                      <input className="input" placeholder="Ej. Banco Pichincha" value={account.bankName} onChange={(event) => updateBankAccount(account.id, "bankName", event.target.value)} />
                    </label>
                    <label className="entity-field">
                      <span>Tipo de cuenta</span>
                      <select className="select" value={account.accountType || "Ahorros"} onChange={(event) => updateBankAccount(account.id, "accountType", event.target.value)}>
                        <option value="Ahorros">Cuenta de ahorros</option>
                        <option value="Corriente">Cuenta corriente</option>
                      </select>
                    </label>
                    <label className="entity-field">
                      <span>Número de cuenta</span>
                      <input className="input" inputMode="numeric" placeholder="Número completo" value={account.accountNumber} onChange={(event) => updateBankAccount(account.id, "accountNumber", event.target.value)} />
                    </label>
                    <label className="entity-field">
                      <span>Titular</span>
                      <input className="input" placeholder="Nombre del titular" value={account.accountHolder} onChange={(event) => updateBankAccount(account.id, "accountHolder", event.target.value)} />
                    </label>
                    <label className="entity-field bank-account-id-field">
                      <span>Cédula o RUC <small>(opcional)</small></span>
                      <input className="input" inputMode="numeric" placeholder="Identificación del titular" value={account.accountId} onChange={(event) => updateBankAccount(account.id, "accountId", event.target.value)} />
                    </label>
                      </div>

                      <div className="bank-account-media-grid">
                    <section className="bank-account-media-editor" aria-label={`Logo de ${accountTitle}`}>
                      <div className="bank-account-media-copy">
                        <strong>Logo del banco</strong>
                        <small>Se mostrará junto al nombre en el selector de pago.</small>
                      </div>
                      <label className="entity-field">
                        <span>URL del logo <small>(opcional)</small></span>
                        <input className="input" placeholder="https://.../logo.png" value={account.bankLogoImage || ""} onChange={(event) => updateBankAccount(account.id, "bankLogoImage", event.target.value)} />
                      </label>
                      <div className="bank-account-media-actions">
                        <label className="btn btn-outline admin-file-btn" aria-disabled={bankQrUploadBusy}>
                          <Upload size={16} />{bankQrUploadBusy ? "Procesando..." : "Subir logo"}
                          <input type="file" accept="image/*" onChange={(event) => handleBankImageUpload(account.id, "bankLogoImage", event)} disabled={bankQrUploadBusy} />
                        </label>
                        {account.bankLogoImage ? <button type="button" className="btn btn-soft" onClick={() => updateBankAccount(account.id, "bankLogoImage", "")}>Quitar logo</button> : null}
                      </div>
                      <div className="bank-account-logo-preview" aria-label={logoImage ? `Vista previa del logo de ${accountTitle}` : "Logo no configurado"}>
                        {logoImage ? <img src={logoImage} alt={`Logo de ${accountTitle}`} /> : <><Landmark size={22} /><span>Sin logo</span></>}
                      </div>
                    </section>

                    <section className="bank-account-media-editor" aria-label={`QR de ${accountTitle}`}>
                      <div className="bank-account-media-copy">
                        <strong>Código QR</strong>
                        <small>Es obligatorio para publicar esta cuenta.</small>
                      </div>
                      <label className="entity-field">
                        <span>URL de la imagen QR</span>
                        <input className="input" placeholder="https://.../qr.png" value={account.bankQrImage} onChange={(event) => updateBankAccount(account.id, "bankQrImage", event.target.value)} />
                      </label>
                      <div className="bank-account-media-actions">
                        <label className="btn btn-outline admin-file-btn" aria-disabled={bankQrUploadBusy}>
                          <Upload size={16} />{bankQrUploadBusy ? "Procesando..." : "Subir QR"}
                          <input type="file" accept="image/*" onChange={(event) => handleBankImageUpload(account.id, "bankQrImage", event)} disabled={bankQrUploadBusy} />
                        </label>
                        {account.bankQrImage ? <button type="button" className="btn btn-soft" onClick={() => updateBankAccount(account.id, "bankQrImage", "")}>Quitar QR</button> : null}
                      </div>
                      {qrImage ? (
                        <button type="button" className="bank-account-qr-preview" onClick={() => setPreviewAccountId(account.id)} aria-label={`Abrir QR de ${accountTitle}`}>
                          <img src={qrImage} alt={`QR de ${accountTitle}`} />
                          <span><ZoomIn size={14} />Abrir imagen</span>
                        </button>
                      ) : <div className="bank-account-logo-preview"><Landmark size={22} /><span>Sin QR</span></div>}
                    </section>
                        <p className="bank-account-media-help">Admite imágenes de hasta {FILE_SECURITY.maxImageSizeMb} MB; se optimizan sin recortar su contenido.</p>
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}

        <div className="bank-accounts-save-row">
          <p>Una cuenta se publica cuando tiene banco, número, titular y QR.</p>
          <button className="btn btn-primary" onClick={saveContactConfiguration} disabled={contactSaveBusy || bankQrUploadBusy} aria-busy={contactSaveBusy}>
            {bankQrUploadBusy ? "Procesando imagen..." : (contactSaveBusy ? "Guardando..." : "Guardar cuentas bancarias")}
          </button>
        </div>
        {contactSyncFeedback?.message ? (
          <div className={`status-message ${contactSyncFeedback.tone === "success" ? "status-success" : (contactSyncFeedback.tone === "error" ? "status-error" : "status-warning")}`}>
            {contactSyncFeedback.message}
          </div>
        ) : null}
      </div>

      <ImageLightbox
        open={Boolean(previewAccount)}
        src={normalizeImageSource(previewAccount?.bankQrImage || "")}
        alt={`QR de ${previewAccount?.bankName || "cuenta bancaria"}`}
        title={`QR · ${previewAccount?.bankName || "Cuenta bancaria"}`}
        onClose={() => setPreviewAccountId("")}
      />
    </div>
  );
}

export default BankAccountsPanel;
