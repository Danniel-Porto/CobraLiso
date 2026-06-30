const express = require("express");
const bcrypt = require("bcrypt");
const { desc, eq } = require("drizzle-orm");
const { requireAdmin } = require("../middleware/auth");

function makeInternalEmail(name) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${base || "user"}.${Date.now()}@cobra.liso.local`;
}

function usersRoutes({ db, schema }) {
  const router = express.Router();
  const { users } = schema;

  router.get("/users", requireAdmin, async (req, res) => {
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    return res.render("users", { users: allUsers, error: null, success: null, active: "users" });
  });

  router.post("/users", requireAdmin, async (req, res) => {
    const name = String(req.body.name || "").trim();
    const password = String(req.body.password || "");
    const role = req.body.role === "admin" ? "admin" : "user";

    if (!name || password.length < 4) {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      return res.status(400).render("users", {
        users: allUsers,
        error: "Nome e senha (minimo 4) sao obrigatorios.",
        success: null,
        active: "users",
      });
    }

    const existingByName = await db.select().from(users).where(eq(users.name, name)).limit(1);
    if (existingByName.length > 0) {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      return res.status(409).render("users", {
        users: allUsers,
        error: "Ja existe um usuario com esse nome.",
        success: null,
        active: "users",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const email = makeInternalEmail(name);

    try {
      await db.insert(users).values({ name, email, passwordHash, role });
    } catch (_error) {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      return res.status(409).render("users", {
        users: allUsers,
        error: "Nao foi possivel cadastrar o usuario.",
        success: null,
        active: "users",
      });
    }

    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    return res.render("users", {
      users: allUsers,
      error: null,
      success: "Usuario criado com sucesso.",
      active: "users",
    });
  });

  return router;
}

module.exports = { usersRoutes };
