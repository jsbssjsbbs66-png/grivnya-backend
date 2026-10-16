"use strict";
const express = require("express");
const crypto = require("node:crypto");
const db = require("../db");
const { signToken, cookieOpts, requireAdmin } = require("../auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return res.status(500).json({ error: "ADMIN_PASSWORD не налаштовано на сервері" });
  }
  const a = Buffer.from(String(password || ""));
  const b = Buffer.from(String(expected));
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: "Невірний пароль адміністратора" });

  const token = signToken({ admin: true });
  res.cookie("grivnya_admin", token, cookieOpts(1));
  res.json({ ok: true });
});

router.post("/logout", (req, res) => {
  res.clearCookie("grivnya_admin");
  res.json({ ok: true });
});

router.get("/submissions", requireAdmin, (req, res) => {
  const status = (req.query.status || "pending").toString();
  const rows = db.prepare(`
    SELECT s.id, s.status, s.amount, s.submitted_at, s.reviewed_at, s.auto_approved,
           u.email AS user_email, t.id AS task_id, t.title AS task_title, t.cat, t.link
    FROM submissions s
    JOIN users u ON u.id = s.user_id
    JOIN tasks t ON t.id = s.task_id
    WHERE s.status = ?
    ORDER BY s.submitted_at ASC
  `).all(status);
  res.json({ submissions: rows });
});

router.post("/submissions/:id/approve", requireAdmin, (req, res) => {
  const sub = db.prepare("SELECT * FROM submissions WHERE id = ?").get(req.params.id);
  if (!sub) return res.status(404).json({ error: "Заявку не знайдено" });
  if (sub.status !== "pending") return res.status(409).json({ error: "Заявка вже переглянута" });

  const tx = db.prepare("BEGIN"); tx.run();
  try {
    db.prepare("UPDATE submissions SET status = 'approved', reviewed_at = datetime('now') WHERE id = ?").run(sub.id);
    db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(sub.amount, sub.user_id);
    db.prepare("COMMIT").run();
    res.json({ ok: true });
  } catch (e) {
    db.prepare("ROLLBACK").run();
    throw e;
  }
});

router.post("/submissions/:id/reject", requireAdmin, (req, res) => {
  const sub = db.prepare("SELECT * FROM submissions WHERE id = ?").get(req.params.id);
  if (!sub) return res.status(404).json({ error: "Заявку не знайдено" });
  if (sub.status !== "pending") return res.status(409).json({ error: "Заявка вже переглянута" });

  db.prepare("UPDATE submissions SET status = 'rejected', reviewed_at = datetime('now') WHERE id = ?").run(sub.id);
  res.json({ ok: true });
});

router.get("/stats", requireAdmin, (req, res) => {
  const users = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const pending = db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status = 'pending'").get().n;
  const approved = db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status = 'approved'").get().n;
  const autoApproved = db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status = 'approved' AND auto_approved = 1").get().n;
  const withdrawalsPending = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS sum FROM withdrawals WHERE status = 'processing'").get();
  res.json({
    users, pending, approved, autoApproved,
    withdrawalsPending: withdrawalsPending.n,
    withdrawalsPendingAmount: withdrawalsPending.sum,
    autoApproveSeconds: require("../db/auto-approve").autoApproveSeconds()
  });
});

module.exports = router;
