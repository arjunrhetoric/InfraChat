import bcrypt from "bcryptjs";
import { db } from "./index.js";

async function main() {
  const count = await db.user.count();
  if (count > 0) {
    console.log(`Seed skipped: ${count} users already exist.`);
    return;
  }
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@infrachat.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await db.user.create({
    data: { username: "admin", email, passwordHash, role: 3 },
  });
  const general = await db.room.create({
    data: {
      name: "general",
      description: "Default public room",
      createdById: admin.id,
      roomType: "public",
      isPrivate: false,
    },
  });
  await db.roomMember.create({
    data: { roomId: general.id, userId: admin.id, isModerator: true },
  });
  await db.auditLog.create({
    data: {
      action: "ROOM_CREATED",
      performedById: admin.id,
      roomId: general.id,
      details: "Seed: general room created",
    },
  });
  console.log(`Seeded admin ${email} + #general`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
