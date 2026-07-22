import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, type FeedbackConfig, type ClassificationConfig, type StageEscalationConfig } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getSessionUserId } from '@/lib/auth/session';
import { resolveEducatorIdForUser } from '@/lib/auth/educator';

// POST — the acting user's educator settings (welcome/closing content, age, stage policy):
// an educator's own row, or, for a student, the class they are bound to. Resolved from the
// session; an `adminId` in the body is ignored, since naming an arbitrary educator used to
// expose any other class's configuration.
export async function POST() {
  try {
    const sessionUserId = await getSessionUserId();
    if (!sessionUserId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const educatorId = await resolveEducatorIdForUser(sessionUserId);
    if (!educatorId) {
      return NextResponse.json({ error: 'No class is associated with this account' }, { status: 403 });
    }

    const adminUser = await db.query.users.findFirst({
      where: and(eq(users.id, educatorId), eq(users.userType, 'admin')),
      columns: {
        id: true,
        username: true,
        age: true,
        welcomeMarkdown: true,
        closingMarkdown: true,
        stageEscalation: true,
        openEnrollment: true,
        instructorLabel: true,
      },
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

// The learner-facing name for the educator. Trimmed, length-capped (it sits in a chat header
// badge and a feedback byline), and normalized to null when blank so the client falls back to
// the built-in default rather than rendering an empty byline.
const INSTRUCTOR_LABEL_MAX = 40;
function sanitizeInstructorLabel(value: unknown): string | null | undefined {
  if (value === undefined) return undefined; // not provided → leave column unchanged
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, INSTRUCTOR_LABEL_MAX) : null;
}

// A config value is either an object (overrides) or null (use system defaults).
function sanitizeConfig<T>(value: unknown): T | null | undefined {
  if (value === undefined) return undefined; // not provided → leave column unchanged
  if (value === null) return null; // explicit clear → revert to system defaults
  if (typeof value === 'object' && !Array.isArray(value)) return value as T;
  return undefined; // anything else → ignore
}

// PATCH - Update the signed-in educator's own global settings: `age`, enrollment policy, and
// the feedback / classification prompt overrides. Only the fields present in the body are
// changed. The target row is always the session user (never a body-supplied id), and must be
// an educator — students have no settings of their own to write.
export async function PATCH(req: NextRequest) {
  try {
    const sessionUserId = await getSessionUserId();
    if (!sessionUserId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const educator = await db.query.users.findFirst({
      where: and(eq(users.id, sessionUserId), eq(users.userType, 'admin'), isNull(users.educatorId)),
      columns: { id: true },
    });
    if (!educator) {
      return NextResponse.json({ error: 'Educator account required' }, { status: 403 });
    }

    const { age, feedbackConfig, classificationConfig, welcomeMarkdown, closingMarkdown, stageEscalation, openEnrollment, instructorLabel } = await req.json();

    const updates: Partial<typeof users.$inferInsert> = {};
    if (age !== undefined) updates.age = age;
    if (welcomeMarkdown !== undefined) updates.welcomeMarkdown = welcomeMarkdown;
    if (closingMarkdown !== undefined) updates.closingMarkdown = closingMarkdown;
    if (typeof openEnrollment === 'boolean') updates.openEnrollment = openEnrollment;
    const label = sanitizeInstructorLabel(instructorLabel);
    if (label !== undefined) updates.instructorLabel = label;
    const se = sanitizeConfig<StageEscalationConfig>(stageEscalation);
    if (se !== undefined) updates.stageEscalation = se;

    const fc = sanitizeConfig<FeedbackConfig>(feedbackConfig);
    if (fc !== undefined) updates.feedbackConfig = fc;
    const cc = sanitizeConfig<ClassificationConfig>(classificationConfig);
    if (cc !== undefined) updates.classificationConfig = cc;

    if (Object.keys(updates).length > 0) {
      await db.update(users)
        .set(updates)
        .where(eq(users.id, educator.id));
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
