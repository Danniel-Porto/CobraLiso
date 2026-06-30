const { and, eq, gt } = require("drizzle-orm");
const { applyMonthlyInterest } = require("./interest");

function getReferenceMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

async function closeMonthForAllLoans(db, schema, actorId) {
  const { loans, monthClosures, transactions } = schema;
  const activeLoans = await db
    .select()
    .from(loans)
    .where(and(eq(loans.status, "active"), gt(loans.balance, "0")));

  let processed = 0;
  const referenceMonth = getReferenceMonth();

  for (const loan of activeLoans) {
    const alreadyClosed = await db
      .select({ id: monthClosures.id })
      .from(monthClosures)
      .where(and(eq(monthClosures.loanId, loan.id), eq(monthClosures.referenceMonth, referenceMonth)))
      .limit(1);

    if (alreadyClosed.length > 0) {
      continue;
    }

    const balanceBefore = Number(loan.balance);
    const { interest, newBalance } = applyMonthlyInterest(balanceBefore, loan.interestRate);
    const nextStatus = newBalance <= 0 ? "paid" : "active";

    await db.transaction(async (tx) => {
      await tx
        .update(loans)
        .set({
          balance: newBalance.toFixed(2),
          status: nextStatus,
        })
        .where(eq(loans.id, loan.id));

      await tx.insert(transactions).values({
        loanId: loan.id,
        type: "interest",
        amount: interest.toFixed(2),
        createdBy: actorId || loan.lenderId,
        note: `Fechamento mensal ${referenceMonth}`,
      });

      await tx.insert(monthClosures).values({
        loanId: loan.id,
        referenceMonth,
        balanceBefore: balanceBefore.toFixed(2),
        interestApplied: interest.toFixed(2),
        paymentsApplied: "0.00",
        balanceAfter: newBalance.toFixed(2),
      });
    });

    processed += 1;
  }

  return { processed, referenceMonth };
}

module.exports = { closeMonthForAllLoans, getReferenceMonth };
