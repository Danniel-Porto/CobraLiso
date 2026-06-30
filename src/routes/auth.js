const express = require("express");
const bcrypt = require("bcrypt");
const { eq } = require("drizzle-orm");

function authRoutes({ db, schema }) {
  const router = express.Router();
  const { users } = schema;

  router.get("/login", (req, res) => {
    if (req.session.user) {
      return res.redirect("/");
    }
    return res.render("login", { error: null });
  });

  router.post("/login", async (req, res) => {
    const name = String(req.body.name || "").trim();
    const password = String(req.body.password || "");

    if (!name || !password) {
      return res.status(400).render("login", { error: "Informe nome e senha." });
    }

    const result = await db.select().from(users).where(eq(users.name, name)).limit(1);
    const user = result[0];

    if (!user) {
      return res.status(401).render("login", { error: "Credenciais invalidas." });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return res.status(401).render("login", { error: "Credenciais invalidas." });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      role: user.role,
    };

    return res.redirect("/");
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/login");
    });
  });

  return router;
}

module.exports = { authRoutes };
