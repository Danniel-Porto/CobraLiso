const { eq, and, isNull } = require("drizzle-orm");

function parseMoney(value) {
  const normalized = String(value || "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function hasLoanAccess(loan, user) {
  return user.id === loan.lenderId || user.id === loan.borrowerId || user.role === "admin";
}

async function getActiveLoan(db, schema, loanId, user) {
  const { loans } = schema;
  const [loan] = await db
    .select()
    .from(loans)
    .where(and(eq(loans.id, loanId), isNull(loans.deletedAt)))
    .limit(1);

  if (!loan || !hasLoanAccess(loan, user)) {
    return null;
  }

  return loan;
}

async function getActivePayment(db, schema, txId, user) {
  const { loans, transactions } = schema;
  const [transaction] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, txId), isNull(transactions.deletedAt)))
    .limit(1);

  if (!transaction || transaction.type !== "payment") {
    return { transaction: null, loan: null };
  }

  const loan = await getActiveLoan(db, schema, transaction.loanId, user);
  if (!loan) {
    return { transaction: null, loan: null };
  }

  return { transaction, loan };
}

module.exports = {
  parseMoney,
  hasLoanAccess,
  getActiveLoan,
  getActivePayment,
};
