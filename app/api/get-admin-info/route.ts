import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, type FeedbackConfig, type ClassificationConfig } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const { adminId } = await req.json();

    if (!adminId) {
      return NextResponse.json(
        { error: 'adminId is required' },
        { status: 400 }
      );
    }

    const adminUser = await db.query.users.findFirst({
      where: and(
        eq(users.id, adminId),
        eq(users.userType, 'admin')
      ),
      columns: {
        id: true,
        username: true,
        age: true
      }
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Admin user not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ adminUser });
  } catch (error) {
    console.error('Error loading admin info:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// A config value is either an object (overrides) or null (use system defaults).
function sanitizeConfig<T>(value: unknown): T | null | undefined {
  if (value === undefined) return undefined; // not provided → leave column unchanged
  if (value === null) return null; // explicit clear → revert to system defaults
  if (typeof value === 'object' && !Array.isArray(value)) return value as T;
  return undefined; // anything else → ignore
}

// PATCH - Update the educator's global settings: `age` and the feedback /
// classification prompt overrides. Only the fields present in the body are changed.
export async function PATCH(req: NextRequest) {
  try {
    const { userId, age, feedbackConfig, classificationConfig } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const updates: Partial<typeof users.$inferInsert> = {};
    if (age !== undefined) updates.age = age;

    const fc = sanitizeConfig<FeedbackConfig>(feedbackConfig);
    if (fc !== undefined) updates.feedbackConfig = fc;
    const cc = sanitizeConfig<ClassificationConfig>(classificationConfig);
    if (cc !== undefined) updates.classificationConfig = cc;

    if (Object.keys(updates).length > 0) {
      await db.update(users)
        .set(updates)
        .where(eq(users.id, userId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating admin info:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
