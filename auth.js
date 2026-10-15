"use strict";
const crypto = require("node:crypto");

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET env var is required in production — set it to a long random string.");
}
const SECRET = SESSION_SECRET || "dev-only-insecure-secret-change-me";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const suppliedHashBuffer = crypto.scryptSync(password, salt, 64);
  if (hashBuffer.length !== suppliedHashBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, suppliedHashBuffer);
}

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signToken(payload) {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expectedSig = b64url(crypto.createHmac("sha256", SECRET).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64").toString("utf8"));
  } catch (e) {
    return null;
  }
}

function cookieOpts(days) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: days * 24 * 60 * 60 * 1000
  };
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.grivnya_session;
  const payload = verifyToken(token);
  if (!payload || !payload.userId) {
    return res.status(401).json({ error: "Потрібно увійти в акаунт" });
  }
  req.userId = payload.userId;
  next();
}

function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies.grivnya_admin;
  const payload = verifyToken(token);
  if (!payload || payload.admin !== true) {
    return res.status(401).json({ error: "Потрібен вхід адміністратора" });
  }
  next();
}

module.exports = {
  hashPassword, verifyPassword, signToken, verifyToken, cookieOpts, requireAuth, requireAdmin
};
