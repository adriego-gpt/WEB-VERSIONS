import React, { useEffect, useMemo, useRef } from "react";
import { X, Eye, EyeOff, KeyRound, UserRound, MapPin } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";

export function UserAuthModal({
  open,
  mode,
  form = {},
  validation = {},
  canSubmit = true,
  error,
  busy = false,
  passwordVisible,
  resetEmailLocked = false,
  onClose,
  onModeChange,
  onFieldChange,
  onTogglePasswordVisibility,
  onSubmit,
}) {
  const isRegister = mode === "register";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";
  const isLogin = !isRegister && !isForgot && !isReset;
  const firstInputRef = useRef(null);
  const fieldErrors = validation?.fieldErrors || {};
  const passwordChecks = validation?.passwordChecks || { minLength: false, hasLetter: false, hasNumber: false };
  const passwordStrengthPercent = Number(validation?.passwordStrengthPercent) || 0;
  const passwordStrengthLabel = useMemo(() => {
    if (passwordStrengthPercent >= 100) return "Contraseña fuerte";
    if (passwordStrengthPercent >= 67) return "Contraseña segura";
    if (passwordStrengthPercent >= 34) return "Contraseña en progreso";
    return "Empieza a crear una contraseña segura";
  }, [passwordStrengthPercent]);

  const showNameError = Boolean(isRegister && fieldErrors.name && String(form?.name || "").trim());
  const showEmailError = Boolean(fieldErrors.email && String(form?.email || "").trim());
  const showPhoneError = Boolean(isRegister && fieldErrors.phone && String(form?.phone || "").trim());
  const showPasswordError = Boolean((isLogin || isRegister || isReset) && fieldErrors.password && String(form?.password || ""));
  const showConfirmPasswordError = Boolean((isRegister || isReset) && fieldErrors.confirmPassword && (String(form?.confirmPassword || "") || String(form?.password || "")));
  const showResetTokenError = Boolean(isReset && fieldErrors.resetToken && String(form?.resetToken || "").trim());
  const authModalTitle = isRegister
    ? "Crear cuenta"
    : isForgot
      ? "Recuperar acceso"
      : isReset
        ? "Nueva contraseña"
        : "Iniciar sesión";
  const authModalSubtitle = isRegister
    ? "Abre tu cuenta en menos de un minuto."
    : isForgot
      ? "Te ayudamos a recuperar tu acceso de forma segura."
      : isReset
        ? "Crea una clave nueva para proteger tu cuenta."
        : "Accede a tu perfil para comprar y gestionar tus pedidos.";

  const authPanelTitle = isRegister
    ? "Crea tu cuenta y compra más rápido"
    : isForgot
      ? "Recupera el acceso en minutos"
      : isReset
        ? "Protege tu cuenta con una nueva clave"
        : "Bienvenido de nuevo";

  const authPanelBody = isRegister
    ? "Guarda tus datos, compra en menos pasos y sigue tus pedidos desde un solo lugar."
    : isForgot
      ? "Te enviaremos un enlace seguro al correo registrado para restablecer tu acceso."
      : isReset
        ? "Define una clave fuerte para entrar con total seguridad."
        : "Inicia sesión y retomamos tu compra exactamente donde la dejaste.";

  useEffect(() => {
    if (!open) return undefined;
    const timeoutId = window.setTimeout(() => {
      firstInputRef.current?.focus({ preventScroll: true });
      firstInputRef.current?.select?.();
    }, 40);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, busy, onClose]);

  const submitDisabled = busy || !canSubmit;
  const showPasswordFields = isLogin || isRegister || isReset;
  const showPasswordMeter = isRegister || isReset;
  const showResetTokenField = isReset && !String(form.resetToken || "").trim();
  const isResetEmailLocked = isReset && !showResetTokenField && resetEmailLocked && Boolean(String(form.email || "").trim());

  return (
    <AnimatePresence initial={false}>
      {open && (
        <Motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="modal-backdrop auth-backdrop"
        >
          <Motion.form
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="login-card"
            role="dialog"
            aria-modal="true"
            aria-label={isRegister ? "Crear cuenta" : isForgot ? "Recuperar cuenta" : isReset ? "Restablecer contraseña" : "Iniciar sesión"}
            onClick={(event) => event.stopPropagation()}
            onSubmit={onSubmit}
          >
            <div className="auth-header">
              <div className="auth-heading">
                <p className="muted auth-kicker" style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".22em" }}>
                  Tu cuenta
                </p>
                <h3 className="auth-title" style={{ margin: "4px 0 0" }}>{authModalTitle}</h3>
                <p className="muted auth-subtitle">{authModalSubtitle}</p>
              </div>
              <button type="button" onClick={onClose} className="icon-btn auth-close-btn" aria-label="Cerrar acceso a la cuenta" disabled={busy}><X size={18} /></button>
            </div>

            <div className="auth-mode-switch" role="tablist" aria-label="Tipo de acceso">
              <button type="button" role="tab" aria-selected={!isRegister} className={`auth-mode-btn ${!isRegister ? "is-active" : ""}`} onClick={() => onModeChange("login")} disabled={busy}>Ingresar</button>
              <button type="button" role="tab" aria-selected={isRegister} className={`auth-mode-btn ${isRegister ? "is-active" : ""}`} onClick={() => onModeChange("register")} disabled={busy}>Crear cuenta</button>
            </div>

            <AnimatePresence mode="wait">
              <Motion.div
                key={mode}
                className="auth-welcome-panel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <p className="auth-welcome-title">{authPanelTitle}</p>
                <p className="auth-welcome-body">{authPanelBody}</p>
              </Motion.div>
            </AnimatePresence>

            <div className="auth-form-grid">
              {isRegister && (
                <div className="auth-field">
                  <input
                    ref={firstInputRef}
                    className={`input${showNameError ? " input-invalid" : ""}`}
                    placeholder="Nombre completo"
                    value={form.name}
                    autoComplete="name"
                    maxLength={90}
                    onChange={(event) => onFieldChange("name", event.target.value)}
                    disabled={busy}
                    aria-invalid={showNameError}
                    aria-describedby={showNameError ? "auth-name-error" : undefined}
                  />
                  {showNameError && <p id="auth-name-error" className="auth-field-error">{fieldErrors.name}</p>}
                </div>
              )}

              <div className="auth-field">
                <input
                  ref={!isRegister && !isResetEmailLocked ? firstInputRef : undefined}
                  className={`input${showEmailError ? " input-invalid" : ""}${isResetEmailLocked ? " input-readonly" : ""}`}
                  type={isLogin ? "text" : "email"}
                  placeholder={isResetEmailLocked ? "Correo verificado" : (isLogin ? "Correo o usuario" : "Correo electronico")}
                  value={form.email}
                  autoComplete={isLogin ? "username" : "email"}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode={isLogin ? "text" : "email"}
                  maxLength={120}
                  onChange={(event) => onFieldChange("email", event.target.value)}
                  readOnly={isResetEmailLocked}
                  disabled={busy}
                  aria-invalid={showEmailError}
                  aria-readonly={isResetEmailLocked}
                  aria-describedby={showEmailError ? "auth-email-error" : undefined}
                />
                {showEmailError && <p id="auth-email-error" className="auth-field-error">{fieldErrors.email}</p>}
              </div>

              {isRegister && (
                <div className="auth-field">
                  <input
                    className={`input${showPhoneError ? " input-invalid" : ""}`}
                    placeholder="Teléfono: 10 dígitos (opcional)"
                    value={form.phone}
                    inputMode="tel"
                    autoComplete="tel-national"
                    maxLength={10}
                    onChange={(event) => onFieldChange("phone", event.target.value)}
                    disabled={busy}
                    aria-invalid={showPhoneError}
                    aria-describedby={showPhoneError ? "auth-phone-error" : undefined}
                  />
                  {showPhoneError && <p id="auth-phone-error" className="auth-field-error">{fieldErrors.phone}</p>}
                </div>
              )}

              {showResetTokenField && (
                <div className="auth-field">
                  <input
                    className={`input${showResetTokenError ? " input-invalid" : ""}`}
                    placeholder="Código de recuperación"
                    value={form.resetToken || ""}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={220}
                    onChange={(event) => onFieldChange("resetToken", event.target.value)}
                    disabled={busy}
                    aria-invalid={showResetTokenError}
                    aria-describedby={showResetTokenError ? "auth-reset-token-error" : undefined}
                  />
                  {showResetTokenError && <p id="auth-reset-token-error" className="auth-field-error">{fieldErrors.resetToken}</p>}
                </div>
              )}

              {showPasswordFields && (
                <div className="auth-field">
                  <div className="password-field">
                    <input
                      className={`input password-input${showPasswordError ? " input-invalid" : ""}`}
                      type={passwordVisible ? "text" : "password"}
                      placeholder={isReset ? "Nueva contraseña" : "Contraseña"}
                      autoComplete={isRegister || isReset ? "new-password" : "current-password"}
                      value={form.password}
                      minLength={8}
                      maxLength={96}
                      onChange={(event) => onFieldChange("password", event.target.value)}
                      disabled={busy}
                      aria-invalid={showPasswordError}
                      aria-describedby={showPasswordError ? "auth-password-error" : undefined}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={onTogglePasswordVisibility}
                      aria-label={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                      aria-pressed={passwordVisible}
                      disabled={busy}
                    >
                      {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {showPasswordError && <p id="auth-password-error" className="auth-field-error">{fieldErrors.password}</p>}
                </div>
              )}

              {showPasswordMeter && (
                <div className="auth-password-meter">
                  <div className="auth-password-meter-track" aria-hidden="true">
                    <span
                      className={`auth-password-meter-fill${passwordStrengthPercent >= 100 ? " is-strong" : ""}`}
                      style={{ transform: `scaleX(${passwordStrengthPercent / 100})` }}
                    />
                  </div>
                  <p className="auth-password-meter-label">{passwordStrengthLabel}</p>
                  <div className="auth-password-checklist">
                    <span className={`auth-password-check${passwordChecks.minLength ? " auth-password-check-ok" : ""}`}>8+ caracteres</span>
                    <span className={`auth-password-check${passwordChecks.hasLetter ? " auth-password-check-ok" : ""}`}>Incluye letras</span>
                    <span className={`auth-password-check${passwordChecks.hasNumber ? " auth-password-check-ok" : ""}`}>Incluye números</span>
                  </div>
                </div>
              )}

              {(isRegister || isReset) && (
                <div className="auth-field">
                  <div className="password-field">
                    <input
                      className={`input password-input${showConfirmPasswordError ? " input-invalid" : ""}`}
                      type={passwordVisible ? "text" : "password"}
                      placeholder={isReset ? "Confirmar nueva contraseña" : "Confirmar contraseña"}
                      autoComplete="new-password"
                      value={form.confirmPassword || ""}
                      minLength={8}
                      maxLength={96}
                      onChange={(event) => onFieldChange("confirmPassword", event.target.value)}
                      disabled={busy}
                      aria-invalid={showConfirmPasswordError}
                      aria-describedby={showConfirmPasswordError ? "auth-confirm-password-error" : undefined}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={onTogglePasswordVisibility}
                      aria-label={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                      aria-pressed={passwordVisible}
                      disabled={busy}
                    >
                      {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {showConfirmPasswordError && <p id="auth-confirm-password-error" className="auth-field-error">{fieldErrors.confirmPassword}</p>}
                </div>
              )}
            </div>

            {isLogin && (
              <div className="auth-foot-links">
                <button type="button" className="link-btn auth-inline-link" onClick={() => onModeChange("forgot")} disabled={busy}>
                  Olvidé mi contraseña
                </button>
              </div>
            )}

            {isForgot && (
              <div className="auth-foot-links">
                <p className="helper-text" style={{ marginTop: 0 }}>
                  Enviaremos un enlace temporal al correo para que restablezcas tu contraseña de forma segura.
                </p>
                <p className="helper-text" style={{ marginTop: 0 }}>
                  Usa el correo con el que creaste tu cuenta.
                </p>
              </div>
            )}

            {error && <div className="status-message status-error" style={{ marginTop: 16 }}>{error}</div>}

            <div className="auth-submit-row">
              <button className="btn btn-primary auth-submit-btn" type="submit" disabled={submitDisabled} aria-busy={busy} aria-disabled={submitDisabled}>
                {busy
                  ? (isRegister ? "Creando cuenta..." : isForgot ? "Enviando enlace..." : isReset ? "Actualizando..." : "Entrando...")
                  : (isRegister ? "Crear mi cuenta" : isForgot ? "Enviar enlace" : isReset ? "Guardar nueva contraseña" : "Entrar a mi cuenta")}
              </button>
            </div>

            <div className="auth-secondary-row">
              <button
                className="link-btn auth-inline-link"
                type="button"
                onClick={() => onModeChange(isRegister ? "login" : isForgot || isReset ? "login" : "register")}
                disabled={busy}
              >
                {isRegister ? "Ya tengo cuenta. Quiero ingresar" : isForgot || isReset ? "Volver a iniciar sesión" : "No tengo cuenta. Quiero crearla"}
              </button>
            </div>
          </Motion.form>
        </Motion.div>
      )}
    </AnimatePresence>
  );
}

export function ProfileModal({
  open,
  onClose,
  activeSection = "datos",
  profileDraft = {},
  onFieldChange,
  onSaveProfile,
  addressBookDraft = {},
  addressBookEditingId,
  onAddressBookDraftChange,
  onSaveAddressBookEntry,
  onEditAddressBookEntry,
  onDeleteAddressBookEntry,
  onSelectAddressBookEntry,
  profileFeedback,
  passwordDraft = {},
  onPasswordFieldChange,
  onChangePassword,
  passwordFeedback,
}) {
  const safeSection = activeSection === "password" || activeSection === "direccion" ? activeSection : "datos";
  const sectionMeta = safeSection === "password"
    ? { title: "Cambio de contraseña", subtitle: "Actualiza tu clave de acceso" }
    : safeSection === "direccion"
      ? { title: "Libreta de direcciones", subtitle: "Guarda tus direcciones de envío en un solo lugar" }
      : { title: "Datos personales", subtitle: "Edita la información de tu cuenta" };

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <Motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="modal-backdrop"
          onClick={onClose}
        >
          <Motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="sheet profile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Perfil y seguridad"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-header">
              <div>
                <p className="muted profile-sheet-kicker" style={{ margin: 0, textTransform: "uppercase", letterSpacing: ".25em" }}>Tu cuenta</p>
                <h3 className="profile-sheet-title" style={{ margin: "8px 0 0" }}>{sectionMeta.title}</h3>
                <p className="muted profile-sheet-subtitle" style={{ margin: "6px 0 0" }}>{sectionMeta.subtitle}</p>
              </div>
              <button type="button" onClick={onClose} className="icon-btn" aria-label="Cerrar perfil"><X size={18} /></button>
            </div>
            <div className="sheet-body">
              {safeSection === "datos" && (
                <div className="surface profile-card">
                  <div className="profile-card-head">
                    <h4 className="profile-section-title" style={{ margin: 0 }}>Datos personales</h4>
                    <UserRound size={20} />
                  </div>
                  <div className="settings-grid" style={{ marginTop: 14 }}>
                    <input className="input" placeholder="Nombre" value={profileDraft?.name || ""} onChange={(event) => onFieldChange("name", event.target.value)} />
                    <input className="input" placeholder="Apellido" value={profileDraft?.lastName || ""} onChange={(event) => onFieldChange("lastName", event.target.value)} />
                    <input className="input" placeholder="Teléfono" inputMode="tel" maxLength={10} value={profileDraft?.phone || ""} onChange={(event) => onFieldChange("phone", event.target.value)} />
                    <input className="input" placeholder="Correo" type="email" value={profileDraft?.email || ""} onChange={(event) => onFieldChange("email", event.target.value)} />
                  </div>
                  {profileFeedback?.message && (
                    <div className={`status-message ${profileFeedback.tone === "error" ? "status-error" : "status-success"}`} style={{ marginTop: 14 }}>
                      {profileFeedback.message}
                    </div>
                  )}
                  <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={onSaveProfile}>
                    Guardar datos
                  </button>
                </div>
              )}

              {safeSection === "direccion" && (
                <div className="surface profile-card">
                  <div className="profile-card-head">
                    <h4 className="profile-section-title" style={{ margin: 0 }}>Libreta de direcciones</h4>
                    <MapPin size={20} />
                  </div>
                  <div className="profile-address-book">
                    <p className="muted profile-address-book-title">Selecciona, agrega o edita tus direcciones</p>
                    {Array.isArray(profileDraft.addressBook) && profileDraft.addressBook.length > 0 ? (
                      <div className="profile-address-book-list">
                        {profileDraft.addressBook.map((entry) => (
                          <div key={entry.id} className={`profile-address-item ${entry.isDefault ? "is-default" : ""}`}>
                            <div className="profile-address-item-head">
                              <strong>{entry.label || "Dirección guardada"}</strong>
                              {entry.isDefault && <span className="badge badge-dark">Principal</span>}
                            </div>
                            <p className="muted profile-address-item-text">{entry.address}</p>
                            {(entry.city || entry.reference || entry.phone) && (
                              <p className="muted profile-address-item-meta">
                                {entry.city ? `Ciudad: ${entry.city}` : ""}
                                {entry.reference ? `${entry.city ? " · " : ""}Ref: ${entry.reference}` : ""}
                                {entry.phone ? `${entry.city || entry.reference ? " · " : ""}Tel: ${entry.phone}` : ""}
                              </p>
                            )}
                            <div className="profile-address-actions">
                              <button type="button" className="btn btn-soft" onClick={() => onSelectAddressBookEntry(entry.id)}>Usar</button>
                              <button type="button" className="btn btn-outline" onClick={() => onEditAddressBookEntry(entry.id)}>Editar</button>
                              <button type="button" className="btn btn-outline" onClick={() => onDeleteAddressBookEntry(entry.id)}>Eliminar</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="helper-text" style={{ margin: 0 }}>Aún no tienes direcciones guardadas.</p>
                    )}
                  </div>
                  <div className="profile-address-editor">
                    <input
                      className="input"
                      placeholder="Etiqueta (Casa, Oficina, Local...)"
                      value={addressBookDraft.label || ""}
                      onChange={(event) => onAddressBookDraftChange("label", event.target.value)}
                    />
                    <textarea
                      className="textarea"
                      placeholder="Direccion para guardar en tu libreta"
                      value={addressBookDraft.address || ""}
                      onChange={(event) => onAddressBookDraftChange("address", event.target.value)}
                    />
                    <div className="settings-grid">
                      <input
                        className="input"
                        placeholder="Ciudad"
                        value={addressBookDraft.city || ""}
                        onChange={(event) => onAddressBookDraftChange("city", event.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Telefono (opcional)"
                        value={addressBookDraft.phone || ""}
                        onChange={(event) => onAddressBookDraftChange("phone", event.target.value)}
                      />
                    </div>
                    <textarea
                      className="textarea"
                      placeholder="Referencia (opcional)"
                      value={addressBookDraft.reference || ""}
                      onChange={(event) => onAddressBookDraftChange("reference", event.target.value)}
                    />
                    <label className="profile-address-default">
                      <input
                        type="checkbox"
                        checked={Boolean(addressBookDraft.isDefault)}
                        onChange={(event) => onAddressBookDraftChange("isDefault", event.target.checked)}
                      />
                      Guardar como dirección principal
                    </label>
                    <button className="btn btn-outline" type="button" onClick={onSaveAddressBookEntry}>
                      {addressBookEditingId ? "Actualizar dirección" : "Guardar dirección"}
                    </button>
                  </div>
                  {profileFeedback?.message && (
                    <div className={`status-message ${profileFeedback.tone === "error" ? "status-error" : "status-success"}`} style={{ marginTop: 14 }}>
                      {profileFeedback.message}
                    </div>
                  )}
                </div>
              )}

              {safeSection === "password" && (
                <div className="surface profile-card">
                  <div className="profile-card-head">
                    <h4 className="profile-section-title" style={{ margin: 0 }}>Cambio de contraseña</h4>
                    <KeyRound size={20} />
                  </div>
                  <div className="grid" style={{ gap: 12, marginTop: 14 }}>
                    <input className="input" type="password" autoComplete="current-password" placeholder="Contrasena actual" value={passwordDraft?.currentPassword || ""} onChange={(event) => onPasswordFieldChange("currentPassword", event.target.value)} />
                    <input className="input" type="password" autoComplete="new-password" placeholder="Nueva contraseña" value={passwordDraft?.newPassword || ""} onChange={(event) => onPasswordFieldChange("newPassword", event.target.value)} />
                    <input className="input" type="password" autoComplete="new-password" placeholder="Confirmar nueva contraseña" value={passwordDraft?.confirmPassword || ""} onChange={(event) => onPasswordFieldChange("confirmPassword", event.target.value)} />
                  </div>
                  {passwordFeedback?.message && (
                    <div className={`status-message ${passwordFeedback.tone === "error" ? "status-error" : "status-success"}`} style={{ marginTop: 14 }}>
                      {passwordFeedback.message}
                    </div>
                  )}
                  <button className="btn btn-outline" style={{ marginTop: 14 }} onClick={onChangePassword}>
                    Actualizar contraseña
                  </button>
                </div>
              )}
            </div>
          </Motion.div>
        </Motion.div>
      )}
    </AnimatePresence>
  );
}
