require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const cron = require("node-cron");

const { db, pool, schema } = require("./db");
const { requireAuth, requireAdmin } = require("./middleware/auth");
const { authRoutes } = require("./routes/auth");
const { usersRoutes } = require("./routes/users");
const { loansRoutes } = require("./routes/loans");
const { paymentsRoutes } = require("./routes/payments");
const { closeMonthForAllLoans } = require("./services/monthClose");

const app = express();
const PgStore = connectPgSimple(session);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    store: new PgStore({
      pool,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.formatMoney = (value) =>
    Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  res.locals.statusLabel = (status) =>
    ({ active: "Ativo", paid: "Quitado", cancelled: "Cancelado" }[status] || status);
  res.locals.statusBadge = (status) =>
    ({ active: "badge-active", paid: "badge-paid", cancelled: "badge-cancelled" }[status] || "");
  res.locals.txTypeLabel = (type) =>
    ({ payment: "Pagamento", interest: "Juros", adjustment: "Ajuste" }[type] || type);
  res.locals.txTypeBadge = (type) =>
    ({ payment: "badge-payment", interest: "badge-interest", adjustment: "badge-adjustment" }[type] || "");
  next();
});

app.use(authRoutes({ db, schema }));
app.use(requireAuth);
app.use(loansRoutes({ db, schema }));
app.use(paymentsRoutes({ db, schema }));
app.use(usersRoutes({ db, schema }));

app.post("/admin/close-month", requireAdmin, async (req, res) => {
  await closeMonthForAllLoans(db, schema, req.session.user.id);
  return res.redirect("/");
});

app.use((_req, res) => {
  res.status(404).render("error", { message: "Pagina nao encontrada." });
});

app.use((error, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).render("error", { message: "Erro interno do servidor." });
});

cron.schedule("5 0 1 * *", async () => {
  try {
    await closeMonthForAllLoans(db, schema, null);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Falha no fechamento mensal:", error);
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Cobra Liso rodando na porta ${port}`);
});
