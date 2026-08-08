import { db } from './index.ts'; // Explicit ESM import extension
import { users } from './schema.ts'; // Explicit ESM import extension
import { eq } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string) {
  try {
    // Use upsert to handle concurrent inserts of the same user ID safely.
    // Updates email if the user already exists, or inserts a new record.
    const result = await db.insert(users)
      .values({
        uid,
        email,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error("Failed to fetch or create user in Cloud SQL database:", error);
    throw new Error("User synchronisation with database failed.", { cause: error });
  }
}
