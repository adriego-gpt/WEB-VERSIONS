import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../../src/App.jsx", import.meta.url);
const syncHookUrl = new URL("../../src/hooks/useUserStateSync.js", import.meta.url);

test("cerrar sesión espera la última sincronización antes de invalidar la sesión", async () => {
  const appSource = await readFile(appUrl, "utf8");
  const logoutStart = appSource.indexOf("const handleUserLogout = async");
  const logoutEnd = appSource.indexOf("const resetSecurityMetricsData", logoutStart);
  const logoutBranch = appSource.slice(logoutStart, logoutEnd);

  assert.ok(logoutStart >= 0 && logoutEnd > logoutStart);
  const flushIndex = logoutBranch.indexOf("await flushUserStateSync()");
  const logoutRequestIndex = logoutBranch.indexOf("await logoutUserAccount()");
  assert.ok(flushIndex >= 0, "debe vaciar la cola de carrito y favoritos");
  assert.ok(flushIndex < logoutRequestIndex, "debe sincronizar antes de invalidar la cookie");
});

test("un cierre fallido conserva la sesión local y muestra el error", async () => {
  const appSource = await readFile(appUrl, "utf8");
  const logoutStart = appSource.indexOf("const handleUserLogout = async");
  const logoutEnd = appSource.indexOf("const resetSecurityMetricsData", logoutStart);
  const logoutBranch = appSource.slice(logoutStart, logoutEnd);

  assert.match(logoutBranch, /const logoutResult = await logoutUserAccount\(\)/);
  assert.match(logoutBranch, /if \(!logoutResult\?\.ok\)/);
  assert.ok(
    logoutBranch.indexOf("if (!logoutResult?.ok)") < logoutBranch.indexOf("setCurrentUser(null)"),
    "no debe borrar la sesión local antes de confirmar el cierre remoto",
  );
});

test("un cierre exitoso elimina del dispositivo los datos privados de la cuenta", async () => {
  const appSource = await readFile(appUrl, "utf8");
  const logoutStart = appSource.indexOf("const handleUserLogout = async");
  const logoutEnd = appSource.indexOf("const resetSecurityMetricsData", logoutStart);
  const logoutBranch = appSource.slice(logoutStart, logoutEnd);

  assert.match(logoutBranch, /setCart\(\[\]\)/);
  assert.match(logoutBranch, /setFavorites\(\[\]\)/);
  assert.match(logoutBranch, /removeStorage\(STORAGE_KEYS\.cart\)/);
  assert.match(logoutBranch, /removeStorage\(STORAGE_KEYS\.favorites\)/);
});

test("el sincronizador expone un vaciado serializable de su cola", async () => {
  const hookSource = await readFile(syncHookUrl, "utf8");

  assert.match(hookSource, /const flushUserStateSync = useCallback/);
  assert.match(hookSource, /activeSyncPromiseRef/);
  assert.match(hookSource, /flushUserStateSync,/);
});

test("registro e inicio de sesión preparan la unión del carrito invitado", async () => {
  const appSource = await readFile(appUrl, "utf8");

  assert.match(appSource, /stageGuestStateMerge\(registerResponse\.user\)[\s\S]*?setCurrentUser\(registerResponse\.user\)/);
  assert.match(appSource, /stageGuestStateMerge\(userLoginResponse\.user\)[\s\S]*?setCurrentUser\(userLoginResponse\.user\)/);
});

test("sin cuenta el carrito se restaura y persiste solamente en el dispositivo", async () => {
  const appSource = await readFile(appUrl, "utf8");
  const hookSource = await readFile(syncHookUrl, "utf8");

  assert.match(appSource, /useState\(\(\) => normalizeStoredCart\(readStorage\(STORAGE_KEYS\.cart, \[\]\)\)\)/);
  assert.match(appSource, /saveStorage\(STORAGE_KEYS\.cart, cart\)/);
  assert.match(appSource, /useState\(\(\) => normalizeStoredFavorites\(readStorage\(STORAGE_KEYS\.favorites, \[\]\)\)\)/);
  assert.match(appSource, /saveStorage\(STORAGE_KEYS\.favorites, favorites\)/);
  assert.match(hookSource, /if \(!currentUserId\) return Promise\.resolve/, "un invitado no debe escribir en ninguna cuenta remota");
});

test("una sesión existente hidrata el usuario desde el servidor al recargar", async () => {
  const appSource = await readFile(appUrl, "utf8");

  assert.match(appSource, /const result = await getUserSessionStatus\(\)/);
  assert.match(appSource, /result\.ok && result\.authenticated && result\.user[\s\S]*?setCurrentUser\(result\.user\)/);
});
