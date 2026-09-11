import crypto from "node:crypto";
import { appendSetCookie, buildSessionCookie, parseCookies, signPayload, verifySignedToken } from "./security.js";

const COOKIE = "adriego_guest_orders";
const TTL = 30 * 24 * 60 * 60;

export function readGuestSession(req) {
  const token = parseCookies(req.headers?.cookie || "")[COOKIE];
  const session = verifySignedToken(token, process.env.USER_SESSION_SECRET);
  return session?.purpose === "guest-orders" && /^guest-[0-9a-f-]{36}$/.test(session.sub || "") ? session : null;
}

export function ensureGuestSession(req, res) {
  const session = readGuestSession(req) || { sub: `guest-${crypto.randomUUID()}`, purpose: "guest-orders" };
  const payload = { ...session, exp: Date.now() + TTL * 1000 };
  appendSetCookie(res, buildSessionCookie(COOKIE, signPayload(payload, process.env.USER_SESSION_SECRET), TTL));
  return payload;
}
