const { pgTable, uuid, varchar, numeric, timestamp, date, text } = require("drizzle-orm/pg-core");

const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const loans = pgTable("loans", {
  id: uuid("id").defaultRandom().primaryKey(),
  lenderId: uuid("lender_id").notNull().references(() => users.id),
  borrowerId: uuid("borrower_id").notNull().references(() => users.id),
  principal: numeric("principal", { precision: 14, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 7, scale: 4 }).notNull(),
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  loanId: uuid("loan_id").notNull().references(() => loans.id),
  type: varchar("type", { length: 20 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  note: text("note"),
  attachmentName: varchar("attachment_name", { length: 255 }),
  attachmentMimeType: varchar("attachment_mime_type", { length: 100 }),
  attachmentBase64: text("attachment_base64"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

const monthClosures = pgTable("month_closures", {
  id: uuid("id").defaultRandom().primaryKey(),
  loanId: uuid("loan_id").notNull().references(() => loans.id),
  referenceMonth: date("reference_month").notNull(),
  balanceBefore: numeric("balance_before", { precision: 14, scale: 2 }).notNull(),
  interestApplied: numeric("interest_applied", { precision: 14, scale: 2 }).notNull(),
  paymentsApplied: numeric("payments_applied", { precision: 14, scale: 2 }).notNull().default("0"),
  balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }).defaultNow().notNull(),
});

module.exports = {
  users,
  loans,
  transactions,
  monthClosures,
};
