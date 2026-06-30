const express = require("express");
const { eq, and, isNull } = require("drizzle-orm");
const multer = require("multer");
const { recalculateLoanBalance } = require("../services/loanBalance");
const { parseMoney, getActiveLoan, getActivePayment } = require("../lib/loanAccess");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

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
    const amount = parseMoney(req.body.amount);
    const note = String(req.body.note || "").trim();
    const user = req.session.user;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).render("error", { message: "Valor de pagamento invalido." });
    }

    const loan = await getActiveLoan(db, schema, req.params.id, user);
    if (!loan) {
      return res.status(404).render("error", { message: "Emprestimo nao encontrado." });
    }

    const attachment = buildAttachment(req.file);
    if (attachment?.error) {
      return res.status(400).render("error", { message: attachment.error });
    }

    const currentBalance = Number(loan.balance);
    const paymentValue = Math.min(amount, currentBalance);

    await db.insert(transactions).values({
      loanId: loan.id,
      type: "payment",
      amount: paymentValue.toFixed(2),
      createdBy: user.id,
      note: note || null,
      attachmentName: attachment?.attachmentName || null,
      attachmentMimeType: attachment?.attachmentMimeType || null,
      attachmentBase64: attachment?.attachmentBase64 || null,
    });

    await recalculateLoanBalance(db, schema, loan.id);
    return res.redirect(`/loans/${loan.id}`);
  });

  router.get("/transactions/:id/edit", async (req, res) => {
    const { transaction, loan } = await getActivePayment(db, schema, req.params.id, req.session.user);
    if (!transaction || !loan) {
      return res.status(404).render("error", { message: "Pagamento nao encontrado." });
    }

    return res.render("payment-edit", {
      transaction,
      loan,
      error: null,
      active: "dashboard",
    });
  });

  router.post("/transactions/:id/edit", upload.single("receiptFile"), async (req, res) => {
    const amount = parseMoney(req.body.amount);
    const note = String(req.body.note || "").trim();
    const removeAttachment = req.body.removeAttachment === "1";

    const { transaction, loan } = await getActivePayment(db, schema, req.params.id, req.session.user);
    if (!transaction || !loan) {
      return res.status(404).render("error", { message: "Pagamento nao encontrado." });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).render("payment-edit", {
        transaction,
        loan,
        error: "Valor de pagamento invalido.",
        active: "dashboard",
      });
    }

    const attachment = buildAttachment(req.file);
    if (attachment?.error) {
      return res.status(400).render("payment-edit", {
        transaction,
        loan,
        error: attachment.error,
        active: "dashboard",
      });
    }

    const updates = {
      amount: amount.toFixed(2),
      note: note || null,
    };

    if (attachment) {
      updates.attachmentName = attachment.attachmentName;
      updates.attachmentMimeType = attachment.attachmentMimeType;
      updates.attachmentBase64 = attachment.attachmentBase64;
    } else if (removeAttachment) {
      updates.attachmentName = null;
      updates.attachmentMimeType = null;
      updates.attachmentBase64 = null;
    }

    await db.update(transactions).set(updates).where(eq(transactions.id, transaction.id));
    await recalculateLoanBalance(db, schema, loan.id);

    return res.redirect(`/loans/${loan.id}`);
  });

  router.post("/transactions/:id/delete", async (req, res) => {
    const { transaction, loan } = await getActivePayment(db, schema, req.params.id, req.session.user);
    if (!transaction || !loan) {
      return res.status(404).render("error", { message: "Pagamento nao encontrado." });
    }

    await db
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(eq(transactions.id, transaction.id));

    await recalculateLoanBalance(db, schema, loan.id);
    return res.redirect(`/loans/${loan.id}`);
  });

  router.post("/transactions/:id/attachment", upload.single("receiptFile"), async (req, res) => {
    const user = req.session.user;
    const { transaction, loan } = await getActivePayment(db, schema, req.params.id, user);

    if (!transaction || !loan) {
      return res.status(404).render("error", { message: "Transacao nao encontrada." });
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
    const user = req.session.user;
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, req.params.id), isNull(transactions.deletedAt)))
      .limit(1);

    if (!transaction) {
      return res.status(404).render("error", { message: "Transacao nao encontrada." });
    }

    const loan = await getActiveLoan(db, schema, transaction.loanId, user);
    if (!loan) {
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
