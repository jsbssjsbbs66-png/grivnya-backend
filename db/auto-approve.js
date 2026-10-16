"use strict";
// Test-mode fallback: if a human admin hasn't reviewed a submission within
// AUTO_APPROVE_SECONDS, approve it automatically so testing doesn't require
// someone to sit in /admin. Disabled unless AUTO_APPROVE_SECONDS is set to a
// positive number — a real-money launch should turn this off and rely on
// genuine human review only.
const db = require("./index");

function autoApproveSeconds() {
  const raw = parseInt(process.env.AUTO_APPROVE_SECONDS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function approveStalePending() {
  const seconds = autoApproveSeconds();
  if (!seconds) return 0;

  const stale = db.prepare(`
    SELECT * FROM submissions
    WHERE status = 'pending'
      AND submitted_at <= datetime('now', ?)
  `).all(`-${seconds} seconds`);

  if (stale.length === 0) return 0;

  for (const sub of stale) {
    const tx = db.prepare("BEGIN"); tx.run();
    try {
      db.prepare(
        "UPDATE submissions SET status = 'approved', reviewed_at = datetime('now'), auto_approved = 1 WHERE id = ? AND status = 'pending'"
      ).run(sub.id);
      db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(sub.amount, sub.user_id);
      db.prepare("COMMIT").run();
    } catch (e) {
      db.prepare("ROLLBACK").run();
      console.error("auto-approve failed for submission", sub.id, e);
    }
  }
  return stale.length;
}

function startAutoApproveLoop() {
  const seconds = autoApproveSeconds();
  if (!seconds) return;
  console.log(`Test-mode auto-approve is ON: pending submissions older than ${seconds}s are approved automatically if no admin acts first.`);
  setInterval(() => {
    try {
      approveStalePending();
    } catch (e) {
      console.error("auto-approve loop error", e);
    }
  }, 10_000);
}

module.exports = { approveStalePending, startAutoApproveLoop, autoApproveSeconds };
