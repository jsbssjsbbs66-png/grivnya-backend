"use strict";
const path = require("node:path");
const express = require("express");
const cookieParser = require("cookie-parser");

const db = require("./db");
const { seedTasks } = require("./db/seed");
const apiRoutes = require("./routes/api");
const adminRoutes = require("./routes/admin");

// Make sure the task catalog is in the DB before serving requests.
seedTasks();

const app = express();
app.disable("x-powered-by");
app.use(express.json());
app.use(cookieParser());

app.use("/api", apiRoutes);
app.use("/api/admin", adminRoutes);

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, "public")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Щось пішло не так на сервері" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Гривня backend running on http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn("WARNING: ADMIN_PASSWORD is not set — /admin review panel login will fail until it is.");
  }
});
