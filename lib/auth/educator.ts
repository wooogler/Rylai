import { db } from '@/lib/db/client';
import { users, type User } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

// Educator lookup + the shared auth payload. Students are bound to exactly one educator via
// users.educator_id, so every auth response (login / signup / me) carries that educator's
// context — it is the only trustworthy source of a learner's "which class am I in", replacing
// the old client-persisted adminUserId that a learner could point anywhere.

export interface EducatorContext {
  id: string;
  username: string;
  age: number | null;
  hasWelcome: boolean;
  openEnrollment: boolean;
  stageEscalation: User['stageEscalation'];
  // How this class's educator is named to its learners. Null = the built-in default label.
  instructorLabel: string | null;
}

// Resolve an educator by their (globally unique) username. Only real educator rows match:
// userType 'admin' AND educator_id IS NULL, so a student who happens to share the name of
// some educator can never be resolved as one.
export async function findEducatorByUsername(username: string): Promise<User | undefined> {
  return db.query.users.findFirst({
    where: and(
      eq(users.username, username),
      eq(users.userType, 'admin'),
      isNull(users.educatorId)
    ),
  });
}

export function toEducatorContext(educator: User): EducatorContext {
  return {
    id: educator.id,
    username: educator.username,
    age: educator.age ?? null,
    hasWelcome: !!(educator.welcomeMarkdown && educator.welcomeMarkdown.trim()),
    openEnrollment: educator.openEnrollment,
    stageEscalation: educator.stageEscalation ?? null,
    instructorLabel: educator.instructorLabel ?? null,
  };
}

export interface AuthUserPayload {
  id: string;
  username: string;
  userType: 'admin' | 'user';
  educatorId: string | null;
  age: number | null;
  openEnrollment: boolean;
  feedbackConfig: User['feedbackConfig'];
  classificationConfig: User['classificationConfig'];
  welcomeMarkdown: string | null;
  closingMarkdown: string | null;
  stageEscalation: User['stageEscalation'];
  instructorLabel: string | null;
  // Populated for students only: the class they belong to.
  educator: EducatorContext | null;
}

// The one shape returned by /api/auth/{login,signup,me}. For a student it resolves the bound
// educator (one extra query); for an educator `educator` is null and the row's own settings
// are what matter.
export async function buildAuthUser(user: User): Promise<AuthUserPayload> {
  let educator: EducatorContext | null = null;
  if (user.educatorId) {
    const row = await db.query.users.findFirst({ where: eq(users.id, user.educatorId) });
    if (row) educator = toEducatorContext(row);
  }

  return {
    id: user.id,
    username: user.username,
    userType: user.userType,
    educatorId: user.educatorId ?? null,
    age: user.age ?? null,
    openEnrollment: user.openEnrollment,
    feedbackConfig: user.feedbackConfig ?? null,
    classificationConfig: user.classificationConfig ?? null,
    welcomeMarkdown: user.welcomeMarkdown ?? null,
    closingMarkdown: user.closingMarkdown ?? null,
    stageEscalation: user.stageEscalation ?? null,
    instructorLabel: user.instructorLabel ?? null,
    educator,
  };
}

// The educator whose content applies to the acting user: an educator's own id, or the
// educator a student is bound to. Returns null when there is no usable context (e.g. an
// unauthenticated caller). Used by routes that must stop trusting a client-supplied
// adminUserId.
export async function resolveEducatorIdForUser(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, userType: true, educatorId: true },
  });
  if (!user) return null;
  return user.userType === 'admin' ? user.id : user.educatorId ?? null;
}
