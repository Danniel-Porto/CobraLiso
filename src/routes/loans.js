const express = require("express");
const { and, desc, eq, isNull, or } = require("drizzle-orm");
const { simulatePayoff } = require("../services/interest");
const { recalculateLoanBalance } = require("../services/loanBalance");
const { parseMoney, getActiveLoan } = require("../lib/loanAccess");

function loansRoutes({ db, schema }) {
  const router = express.Router();
  const { users, loans, transactions } = schema;

  const notDeleted = isNull(loans.deletedAt);

  router.get("/", async (req, res) => {
    const userId = req.session.user.id;

    const myLoans = await db
      .select()
      .from(loans)
      .where(and(or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)), notDeleted))
      .orderBy(desc(loans.createdAt));

    const allUsers = await db.select().from(users);
    const userMap = Object.fromEntries(allUsers.map((u) => [u.id, u.name]));

    const enrichedLoans = myLoans.map((loan) => ({
      ...loan,
      lenderName: userMap[loan.lenderId] || "?",
      borrowerName: userMap[loan.borrowerId] || "?",
      isLender: loan.lenderId === userId,
      isBorrower: loan.borrowerId === userId,
    }));

    let totalOwed = 0;
    let totalToReceive = 0;
    for (const loan of enrichedLoans) {
      const balance = Number(loan.balance);
      if (loan.status !== "active" || balance <= 0) continue;
      if (loan.isBorrower) totalOwed += balance;
      if (loan.isLender) totalToReceive += balance;
    }

    return res.render("dashboard", {
      loans: enrichedLoans,
      totalOwed,
      totalToReceive,
      active: "dashboard",
    });
  });

  router.get("/loans/new", async (req, res) => {
    const allUsers = await db.select().from(users).orderBy(users.name);
    return res.render("loan-form", { users: allUsers, error: null, active: "new-loan" });
  });

  router.post("/loans", async (req, res) => {
    const lenderId = String(req.body.lenderId || "");
    const borrowerId = String(req.body.borrowerId || "");
    const principal = parseMoney(req.body.principal);
    const interestRate = parseMoney(req.body.interestRate);

    if (!lenderId || !borrowerId || lenderId === borrowerId || !Number.isFinite(principal) || principal <= 0 || !Number.isFinite(interestRate) || interestRate < 0) {
      const allUsers = await db.select().from(users).orderBy(users.name);
      return res.status(400).render("loan-form", {
        users: allUsers,
        error: "Dados invalidos. Verifique credor, devedor, valor e taxa.",
        active: "new-loan",
      });
    }

    await db.insert(loans).values({
      lenderId,
      borrowerId,
      principal: principal.toFixed(2),
      interestRate: interestRate.toFixed(4),
      balance: principal.toFixed(2),
      status: "active",
    });

    return res.redirect("/");
  });

  router.get("/loans/:id/edit", async (req, res) => {
    const loan = await getActiveLoan(db, schema, req.params.id, req.session.user);
    if (!loan) {
      return res.status(404).render("error", { message: "Emprestimo nao encontrado." });
    }

    const allUsers = await db.select().from(users).orderBy(users.name);
    return res.render("loan-edit", { loan, users: allUsers, error: null, active: "dashboard" });
  });

  router.post("/loans/:id/edit", async (req, res) => {
    const loan = await getActiveLoan(db, schema, req.params.id, req.session.user);
    if (!loan) {
      return res.status(404).render("error", { message: "Emprestimo nao encontrado." });
    }

    const lenderId = String(req.body.lenderId || "");
    const borrowerId = String(req.body.borrowerId || "");
    const principal = parseMoney(req.body.principal);
    const interestRate = parseMoney(req.body.interestRate);
    const allUsers = await db.select().from(users).orderBy(users.name);

    if (!lenderId || !borrowerId || lenderId === borrowerId || !Number.isFinite(principal) || principal <= 0 || !Number.isFinite(interestRate) || interestRate < 0) {
      return res.status(400).render("loan-edit", {
        loan,
        users: allUsers,
        error: "Dados invalidos. Verifique credor, devedor, valor e taxa.",
        active: "dashboard",
      });
    }

    await db
      .update(loans)
      .set({
        lenderId,
        borrowerId,
        principal: principal.toFixed(2),
        interestRate: interestRate.toFixed(4),
      })
      .where(eq(loans.id, loan.id));

    await recalculateLoanBalance(db, schema, loan.id);
    return res.redirect(`/loans/${loan.id}`);
  });

  router.post("/loans/:id/delete", async (req, res) => {
    const loan = await getActiveLoan(db, schema, req.params.id, req.session.user);
    if (!loan) {
      return res.status(404).render("error", { message: "Emprestimo nao encontrado." });
    }

    await db
      .update(loans)
      .set({
        deletedAt: new Date(),
        status: "cancelled",
      })
      .where(eq(loans.id, loan.id));

    return res.redirect("/");
  });

  router.get("/loans/:id", async (req, res) => {
    const userId = req.session.user.id;
    const loan = await getActiveLoan(db, schema, req.params.id, req.session.user);
    if (!loan) {
      return res.status(404).render("error", { message: "Emprestimo nao encontrado." });
    }

    const txs = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.loanId, loan.id), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.createdAt));

    const [lender] = await db.select().from(users).where(eq(users.id, loan.lenderId)).limit(1);
    const [borrower] = await db.select().from(users).where(eq(users.id, loan.borrowerId)).limit(1);

    return res.render("loan-detail", {
      loan,
      lender,
      borrower,
      transactions: txs,
      simulation: null,
      error: null,
      success: null,
      active: "dashboard",
      isBorrower: loan.borrowerId === userId,
      isLender: loan.lenderId === userId,
    });
  });

  router.post("/loans/:id/simulate", async (req, res) => {
    const userId = req.session.user.id;
    const loan = await getActiveLoan(db, schema, req.params.id, req.session.user);
    if (!loan) {
      return res.status(404).render("error", { message: "Emprestimo nao encontrado." });
    }

    const firstPayment = parseMoney(req.body.firstPayment);
    const afterMonth = Number(req.body.afterMonth || 0);
    const secondPayment = parseMoney(req.body.secondPayment);

    const safeFirst = Number.isFinite(firstPayment) && firstPayment > 0 ? firstPayment : 0;
    const safeAfterMonth = Number.isInteger(afterMonth) && afterMonth >= 0 ? afterMonth : 0;
    const safeSecond = Number.isFinite(secondPayment) && secondPayment > 0 ? secondPayment : safeFirst;

    const simulation = simulatePayoff({
      balance: loan.balance,
      ratePercent: loan.interestRate,
      getPaymentForMonth: (month) => (safeAfterMonth > 0 && month > safeAfterMonth ? safeSecond : safeFirst),
    });

    const txs = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.loanId, loan.id), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.createdAt));
    const [lender] = await db.select().from(users).where(eq(users.id, loan.lenderId)).limit(1);
    const [borrower] = await db.select().from(users).where(eq(users.id, loan.borrowerId)).limit(1);

    return res.render("loan-detail", {
      loan,
      lender,
      borrower,
      transactions: txs,
      simulation,
      error: null,
      success: null,
      active: "dashboard",
      isBorrower: loan.borrowerId === userId,
      isLender: loan.lenderId === userId,
    });
  });

  return router;
}

module.exports = { loansRoutes };
