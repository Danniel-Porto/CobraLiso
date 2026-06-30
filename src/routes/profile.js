const express = require("express");
const bcrypt = require("bcrypt");
const { eq, sql, and, ne } = require("drizzle-orm");

function profileRoutes({ db, schema }) {
  const router = express.Router();
  const { users } = schema;

  router.get("/profile", async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.session.user.id)).limit(1);
    if (!user) {
      return res.status(404).render("error", { message: "Usuario nao encontrado." });
    }

    return res.render("profile", {
      user,
      error: null,
      success: null,
      active: "profile",
    });
  });

  router.post("/profile", async (req, res) => {
    const name = String(req.body.name || "").trim();
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    const [user] = await db.select().from(users).where(eq(users.id, req.session.user.id)).limit(1);
    if (!user) {
      return res.status(404).render("error", { message: "Usuario nao encontrado." });
    }

    const renderProfile = (error, success) =>
      res.render("profile", { user, error, success, active: "profile" });

    if (!currentPassword) {
      return renderProfile("Informe sua senha atual para confirmar alteracoes.");
    }

    const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatches) {
      return renderProfile("Senha atual incorreta.");
    }

    if (!name) {
      return renderProfile("O nome nao pode ficar vazio.");
    }

    const nameChanged = name.toLowerCase() !== user.name.toLowerCase();
    const passwordChanged = newPassword.length > 0 || confirmPassword.length > 0;

    if (!nameChanged && !passwordChanged) {
      return renderProfile(null, "Nenhuma alteracao foi feita.");
    }

    if (nameChanged) {
      const duplicate = await db
        .select({ id: users.id })
        .from(users)
        .where(and(sql`lower(${users.name}) = lower(${name})`, ne(users.id, user.id)))
        .limit(1);

      if (duplicate.length > 0) {
        return renderProfile("Ja existe outro usuario com esse nome.");
      }
    }

    if (passwordChanged) {
      if (newPassword.length < 4) {
        return renderProfile("A nova senha deve ter no minimo 4 caracteres.");
      }
      if (newPassword !== confirmPassword) {
        return renderProfile("A confirmacao da nova senha nao confere.");
      }
    }

    const updates = { name };
    if (passwordChanged) {
      updates.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await db.update(users).set(updates).where(eq(users.id, user.id));

    req.session.user = {
      ...req.session.user,
      name,
    };

    const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const messages = [];
    if (nameChanged) messages.push("nome");
    if (passwordChanged) messages.push("senha");

    return res.render("profile", {
      user: updatedUser,
      error: null,
      success: `Perfil atualizado: ${messages.join(" e ")} alterado(s) com sucesso.`,
      active: "profile",
    });
  });

  return router;
}

module.exports = { profileRoutes };
