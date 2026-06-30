const express = require("express");
const { eq } = require("drizzle-orm");
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function parseMoney(value) {
  const normalized = String(value || "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function hasLoanAccess(loan, user) {
  return user.id === loan.lenderId || user.id === loan.borrowerId || user.role === "admin";
}

function buildAttachment(file) {
  if (!file) {
    return null;
  }

  const isPdfMime = file.mimetype === "application/pdf";
  const isPdfByName = file.originalname.toLowerCase().endsWith(".pdf");
  if (!isPdfMime && !isPdfByName) {
    return { error: "Apenas arquivo PDF e permitido." };
  }

  return {
    attachmentName: file.originalname.slice(0, 255),
    attachmentMimeType: "application/pdf",
    attachmentBase64: file.buffer.toString("base64"),
  };
}

function paymentsRoutes({ db, schema }) {
  const router = express.Router();
  const { loans, transactions } = schema;

  router.post("/loans/:id/payments", upload.single("receiptFile"), async (req, res) => {
    const loanId = req.params.id;
    const amount = parseMoney(req.body.amount);
    const note = String(req.body.note || "").trim();
    const user = req.session.user;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).render("error", { message: "Valor de pagamento invalido." });
    }

    const [loan] = await db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
    if (!loan) {
      return res.status(404).render("error", { message: "Emprestimo nao encontrado." });
    }

    if (!hasLoanAccess(loan, user)) {
      return res.status(403).render("error", { message: "Sem permissao para este emprestimo." });
    }

    const attachment = buildAttachment(req.file);
    if (attachment?.error) {
      return res.status(400).render("error", { message: attachment.error });
    }

    const currentBalance = Number(loan.balance);
    const paymentValue = Math.min(amount, currentBalance);
    const nextBalance = Math.max(0, currentBalance - paymentValue);
    const nextStatus = nextBalance === 0 ? "paid" : loan.status;

    await db.transaction(async (tx) => {
      await tx
        .update(loans)
        .set({
          balance: nextBalance.toFixed(2),
          status: nextStatus,
        })
        .where(eq(loans.id, loan.id));

      await tx.insert(transactions).values({
        loanId: loan.id,
        type: "payment",
        amount: paymentValue.toFixed(2),
        createdBy: user.id,
        note: note || null,
        attachmentName: attachment?.attachmentName || null,
        attachmentMimeType: attachment?.attachmentMimeType || null,
        attachmentBase64: attachment?.attachmentBase64 || null,
      });
    });

    return res.redirect(`/loans/${loan.id}`);
  });

  router.post("/transactions/:id/attachment", upload.single("receiptFile"), async (req, res) => {
    const txId = req.params.id;
    const user = req.session.user;
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);

    if (!transaction) {
      return res.status(404).render("error", { message: "Transacao nao encontrada." });
    }

    const [loan] = await db.select().from(loans).where(eq(loans.id, transaction.loanId)).limit(1);
    if (!loan || !hasLoanAccess(loan, user)) {
      return res.status(403).render("error", { message: "Sem permissao para esta transacao." });
    }

    const attachment = buildAttachment(req.file);
    if (!attachment) {
      return res.status(400).render("error", { message: "Selecione um arquivo PDF." });
    }
    if (attachment.error) {
      return res.status(400).render("error", { message: attachment.error });
    }

    await db
      .update(transactions)
      .set({
        attachmentName: attachment.attachmentName,
        attachmentMimeType: attachment.attachmentMimeType,
        attachmentBase64: attachment.attachmentBase64,
      })
      .where(eq(transactions.id, transaction.id));

    return res.redirect(`/loans/${loan.id}`);
  });

  router.get("/transactions/:id/attachment/download", async (req, res) => {
    const txId = req.params.id;
    const user = req.session.user;
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, txId)).limit(1);

    if (!transaction) {
      return res.status(404).render("error", { message: "Transacao nao encontrada." });
    }

    const [loan] = await db.select().from(loans).where(eq(loans.id, transaction.loanId)).limit(1);
    if (!loan || !hasLoanAccess(loan, user)) {
      return res.status(403).render("error", { message: "Sem permissao para esta transacao." });
    }

    if (!transaction.attachmentBase64) {
      return res.status(404).render("error", { message: "Comprovante nao encontrado para esta transacao." });
    }

    const buffer = Buffer.from(transaction.attachmentBase64, "base64");
    res.setHeader("Content-Type", transaction.attachmentMimeType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${transaction.attachmentName || `comprovante-${transaction.id}.pdf`}"`
    );
    return res.send(buffer);
  });

  return router;
}

module.exports = { paymentsRoutes };
