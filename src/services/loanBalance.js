const { eq, and, isNull, asc } = require("drizzle-orm");

async function recalculateLoanBalance(db, schema, loanId) {
  const { loans, transactions } = schema;

  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
  if (!loan || loan.deletedAt) {
    return null;
  }

  const txs = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.loanId, loanId), isNull(transactions.deletedAt)))
    .orderBy(asc(transactions.createdAt));

  let balance = Number(loan.principal);
  for (const tx of txs) {
    const amount = Number(tx.amount);
    if (tx.type === "payment") {
      balance -= amount;
    } else if (tx.type === "interest" || tx.type === "adjustment") {
      balance += amount;
    }
  }

  balance = Math.max(0, Number(balance.toFixed(2)));
  const status = balance === 0 ? "paid" : "active";

  await db
    .update(loans)
    .set({
      balance: balance.toFixed(2),
      status,
    })
    .where(eq(loans.id, loanId));

  return balance;
}

module.exports = { recalculateLoanBalance };
