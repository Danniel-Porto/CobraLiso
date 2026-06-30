require("dotenv").config();

const bcrypt = require("bcrypt");
const { eq } = require("drizzle-orm");
const { db, pool, schema } = require("../src/db");

function makeInternalEmail(name) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${base || "admin"}.${Date.now()}@cobra.liso.local`;
}

async function run() {
  const name = process.argv[2] || "Admin";
  const password = process.argv[3] || "1234";
  const email = makeInternalEmail(name);

  const existing = await db.select().from(schema.users).where(eq(schema.users.name, name)).limit(1);
  if (existing.length > 0) {
    // eslint-disable-next-line no-console
    console.log("Usuario ja existe para este nome.");
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(schema.users).values({
    name,
    email,
    passwordHash,
    role: "admin",
  });

  // eslint-disable-next-line no-console
  console.log(`Admin criado: ${name}`);
  await pool.end();
}

run().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  await pool.end();
  process.exit(1);
});
