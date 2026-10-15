"use strict";
const express = require("express");
const crypto = require("node:crypto");
const db = require("../db");
const { hashPassword, verifyPassword, signToken, cookieOpts, requireAuth } = require("../auth");

const router = express.Router();

function genRefCode() {
  return crypto.randomBytes(4).toString("hex");
}

function getUser(id) {
  return db.prepare("SELECT id, email, balance, ref_code, created_at FROM users WHERE id = ?").get(id);
}

// ---------- auth ----------

router.post("/register", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || String(password).length < 6) {
    return res.status(400).json({ error: "Потрібен email і пароль (мінімум 6 символів)" });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) return res.status(409).json({ error: "Акаунт з такою поштою вже існує" });

  const passwordHash = hashPassword(String(password));
  let refCode = genRefCode();
  // extremely unlikely collision, but guard anyway
  while (db.prepare("SELECT id FROM users WHERE ref_code = ?").get(refCode)) refCode = genRefCode();

  const info = db.prepare(
    "INSERT INTO users (email, password_hash, ref_code) VALUES (?, ?, ?)"
  ).run(normalizedEmail, passwordHash, refCode);

  const token = signToken({ userId: info.lastInsertRowid });
  res.cookie("grivnya_session", token, cookieOpts(30));
  res.status(201).json({ user: getUser(info.lastInsertRowid) });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Потрібен email і пароль" });
  const normalizedEmail = String(email).trim().toLowerCase();
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
  if (!row || !verifyPassword(String(password), row.password_hash)) {
    return res.status(401).json({ error: "Невірна пошта або пароль" });
  }
  const token = signToken({ userId: row.id });
  res.cookie("grivnya_session", token, cookieOpts(30));
  res.json({ user: getUser(row.id) });
});

router.post("/logout", (req, res) => {
  res.clearCookie("grivnya_session");
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  const user = getUser(req.userId);
  if (!user) return res.status(401).json({ error: "Акаунт не знайдено" });
  res.json({ user });
});

// ---------- tasks ----------

function slotsLeftFor(taskId, slots) {
  if (slots == null) return null;
  const taken = db.prepare(
    "SELECT COUNT(*) AS n FROM submissions WHERE task_id = ? AND status IN ('pending','approved')"
  ).get(taskId).n;
  return Math.max(0, slots - taken);
}

router.get("/tasks", requireAuth, (req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks ORDER BY cat, price").all();
  const mySubs = db.prepare(
    "SELECT task_id, status FROM submissions WHERE user_id = ? AND status IN ('pending','approved')"
  ).all(req.userId);
  const myStatus = new Map(mySubs.map((s) => [s.task_id, s.status]));

  const out = tasks.map((t) => ({
    id: t.id, cat: t.cat, title: t.title, price: t.price, time: t.time_label,
    seconds: t.seconds, icon: t.icon, link: t.link, slots: t.slots,
    slotsLeft: slotsLeftFor(t.id, t.slots),
    myStatus: myStatus.get(t.id) || "available" // available | pending | approved
  }));
  res.json({ tasks: out });
});

router.post("/tasks/:id/submit", requireAuth, (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "Завдання не знайдено" });

  const already = db.prepare(
    "SELECT id FROM submissions WHERE user_id = ? AND task_id = ? AND status IN ('pending','approved')"
  ).get(req.userId, task.id);
  if (already) return res.status(409).json({ error: "Це завдання вже надіслано або виконано" });

  const left = slotsLeftFor(task.id, task.slots);
  if (left !== null && left <= 0) return res.status(409).json({ error: "Місця на це завдання закінчились" });

  const info = db.prepare(
    "INSERT INTO submissions (user_id, task_id, status, amount) VALUES (?, ?, 'pending', ?)"
  ).run(req.userId, task.id, task.price);

  res.status(201).json({
    submission: { id: info.lastInsertRowid, taskId: task.id, amount: task.price, status: "pending" }
  });
});

// ---------- wallet ----------

router.get("/wallet", requireAuth, (req, res) => {
  const user = getUser(req.userId);

  const subs = db.prepare(`
    SELECT s.id, s.status, s.amount, s.submitted_at AS date, t.title
    FROM submissions s JOIN tasks t ON t.id = s.task_id
    WHERE s.user_id = ? ORDER BY s.submitted_at DESC
  `).all(req.userId);

  const withdrawals = db.prepare(`
    SELECT id, status, amount, requested_at AS date FROM withdrawals
    WHERE user_id = ? ORDER BY requested_at DESC
  `).all(req.userId);

  const ledger = [
    ...subs
      .filter((s) => s.status !== "rejected")
      .map((s) => ({
        kind: "task", title: s.title, amount: s.amount, date: s.date,
        status: s.status === "approved" ? "done" : "pending"
      })),
    ...withdrawals.map((w) => ({
      kind: "withdraw", title: "Заявка на виведення", amount: -w.amount, date: w.date,
      status: "pending" // always honestly "processing" — no payment processor connected yet
    }))
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  res.json({ balance: user.balance, ledger });
});

router.post("/withdraw", requireAuth, (req, res) => {
  const amount = parseInt(req.body && req.body.amount, 10);
  if (!amount || amount <= 0) return res.status(400).json({ error: "Вкажи коректну суму" });
  const user = getUser(req.userId);
  if (amount > user.balance) return res.status(400).json({ error: "Сума перевищує баланс" });

  const tx = db.prepare("BEGIN"); tx.run();
  try {
    db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(amount, req.userId);
    const info = db.prepare(
      "INSERT INTO withdrawals (user_id, amount, status) VALUES (?, ?, 'processing')"
    ).run(req.userId, amount);
    db.prepare("COMMIT").run();
    res.status(201).json({
      withdrawal: { id: info.lastInsertRowid, amount, status: "processing" },
      note: "Статус «В обробці» — реальний платіжний провайдер ще не підключений, тож виплата поки не йде фактичним переказом коштів."
    });
  } catch (e) {
    db.prepare("ROLLBACK").run();
    throw e;
  }
});

module.exports = router;
