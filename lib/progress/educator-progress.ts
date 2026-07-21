import { db } from '@/lib/db/client';
import { scenarios, scenarioProgress, userMessages } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

// Per-scenario progress summary for one participant, as shown to their educator. One entry
// per scenario the educator owns, in scenario order, with zero/null values for scenarios the
// participant hasn't started.
export interface ParticipantProgress {
  scenarioId: number;
  scenarioName: string;
  protectiveRate: number | null;
  protectiveCount: number;
  neutralCount: number;
  vulnerableCount: number;
  masteryReachedAt: number | null;
  completedAt: number | null;
  comfortExitAt: number | null;
  visitCount: number;
  lastVisitedAt: number | null;
  // Number of messages the participant sent (their own replies) in this scenario.
  messageCount: number;
}

// Build the per-scenario progress rows for a set of participants of one educator. Batched:
// three queries total regardless of how many participants are passed. Shared by the access-
// code list and the student roster so both render an identical shape.
export async function buildProgressByUser(
  educatorId: string,
  userIds: string[]
): Promise<Map<string, ParticipantProgress[]>> {
  const byUser = new Map<string, ParticipantProgress[]>();

  const scenarioRows = await db.query.scenarios.findMany({
    where: eq(scenarios.userId, educatorId),
    columns: { id: true, name: true },
    orderBy: (t, { asc }) => [asc(t.id)],
  });
  const scenarioIds = scenarioRows.map((s) => s.id);

  if (userIds.length === 0 || scenarioIds.length === 0) {
    for (const id of userIds) {
      byUser.set(
        id,
        scenarioRows.map((s) => emptyProgress(s.id, s.name))
      );
    }
    return byUser;
  }

  const progressRows = await db.query.scenarioProgress.findMany({
    where: and(
      inArray(scenarioProgress.userId, userIds),
      inArray(scenarioProgress.scenarioId, scenarioIds)
    ),
  });
  const progressByUser = new Map<string, Map<number, (typeof progressRows)[number]>>();
  for (const p of progressRows) {
    if (!progressByUser.has(p.userId)) progressByUser.set(p.userId, new Map());
    progressByUser.get(p.userId)!.set(p.scenarioId, p);
  }

  // Count each participant's own messages (their replies) per scenario. Useful especially
  // for assessment scenarios, where there's no gate/score to convey activity.
  const msgCountRows = await db
    .select({
      userId: userMessages.userId,
      scenarioId: userMessages.scenarioId,
      count: sql<number>`count(*)`,
    })
    .from(userMessages)
    .where(
      and(
        inArray(userMessages.userId, userIds),
        inArray(userMessages.scenarioId, scenarioIds),
        eq(userMessages.sender, 'user')
      )
    )
    .groupBy(userMessages.userId, userMessages.scenarioId);
  const msgCountByUser = new Map<string, Map<number, number>>();
  for (const r of msgCountRows) {
    if (!msgCountByUser.has(r.userId)) msgCountByUser.set(r.userId, new Map());
    msgCountByUser.get(r.userId)!.set(r.scenarioId, Number(r.count));
  }

  for (const userId of userIds) {
    const byScenario = progressByUser.get(userId);
    const byMsgCount = msgCountByUser.get(userId);
    byUser.set(
      userId,
      scenarioRows.map((s) => {
        const p = byScenario?.get(s.id);
        if (!p) return { ...emptyProgress(s.id, s.name), messageCount: byMsgCount?.get(s.id) ?? 0 };
        return {
          scenarioId: s.id,
          scenarioName: s.name,
          protectiveRate: p.protectiveRate ?? null,
          protectiveCount: p.protectiveCount,
          neutralCount: p.neutralCount,
          vulnerableCount: p.vulnerableCount,
          masteryReachedAt: p.masteryReachedAt ? p.masteryReachedAt.getTime() : null,
          completedAt: p.completedAt ? p.completedAt.getTime() : null,
          comfortExitAt: p.comfortExitAt ? p.comfortExitAt.getTime() : null,
          visitCount: p.visitCount,
          lastVisitedAt: p.lastVisitedAt ? p.lastVisitedAt.getTime() : null,
          messageCount: byMsgCount?.get(s.id) ?? 0,
        };
      })
    );
  }

  return byUser;
}

function emptyProgress(scenarioId: number, scenarioName: string): ParticipantProgress {
  return {
    scenarioId,
    scenarioName,
    protectiveRate: null,
    protectiveCount: 0,
    neutralCount: 0,
    vulnerableCount: 0,
    masteryReachedAt: null,
    completedAt: null,
    comfortExitAt: null,
    visitCount: 0,
    lastVisitedAt: null,
    messageCount: 0,
  };
}
