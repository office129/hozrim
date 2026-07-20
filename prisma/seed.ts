import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEFAULT_LIBRARY_TITLES = [
  "היכרות ופתיחה",
  "שחרור והנחה",
  "שורשים משפחתיים",
  "עיבוד רגשי",
  "בניית תמיכה פנימית",
  "חזרה הביתה",
];

function randomPassword() {
  return Math.random().toString(36).slice(-5) + Math.random().toString(36).slice(-5);
}

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || "office@hozrimlebereshit.co.il").toLowerCase();
  const existingAdmin = await prisma.admin.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    const adminPassword = process.env.ADMIN_PASSWORD || randomPassword();
    await prisma.admin.create({
      data: {
        email: adminEmail,
        name: "מנהל/ת",
        passwordHash: await bcrypt.hash(adminPassword, 10),
      },
    });
    console.log("\n=== נוצר חשבון ניהול ===");
    console.log(`אימייל:  ${adminEmail}`);
    console.log(`סיסמה:   ${adminPassword}`);
    console.log("מומלץ להתחבר ולשמור את הפרטים במקום בטוח.\n");
  } else {
    console.log(`חשבון ניהול קיים כבר עבור ${adminEmail} — לא נוצר מחדש.`);
  }

  const libraryCount = await prisma.libraryItem.count();
  if (libraryCount === 0) {
    await prisma.libraryItem.createMany({
      data: DEFAULT_LIBRARY_TITLES.map((title, i) => ({ title, number: i + 1 })),
    });
    console.log(`נוצרו ${DEFAULT_LIBRARY_TITLES.length} פריטי פתיחה בסיסיים בספריית התכנים.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
