"use strict";
const db = require("./index");
const { buildTaskCatalog } = require("./tasks-catalog");

function seedTasks() {
  const catalog = buildTaskCatalog();
  const upsert = db.prepare(`
    INSERT INTO tasks (id, cat, title, price, time_label, seconds, icon, link, slots)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      cat=excluded.cat, title=excluded.title, price=excluded.price,
      time_label=excluded.time_label, seconds=excluded.seconds,
      icon=excluded.icon, link=excluded.link, slots=excluded.slots
  `);
  const tx = db.prepare("BEGIN");
  const commit = db.prepare("COMMIT");
  tx.run();
  try {
    for (const t of catalog) {
      upsert.run(t.id, t.cat, t.title, t.price, t.time, t.seconds, t.icon, t.link, t.slots);
    }
    // Remove tasks that no longer exist in the catalog (keeps re-seeds clean)
    const ids = catalog.map((t) => t.id);
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM tasks WHERE id NOT IN (${placeholders})`).run(...ids);
    commit.run();
    console.log(`Seeded ${catalog.length} tasks.`);
  } catch (e) {
    db.prepare("ROLLBACK").run();
    throw e;
  }
}

if (require.main === module) {
  seedTasks();
}

module.exports = { seedTasks };
