import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { accessCodes, users, scenarios, scenarioProgress } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

// Educator-issued participant access codes (Evaluation Plan §6, L101–102). Codes gate learner
// signup: a learner must present an unused code, which is then consumed.

function genCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

// Per-scenario progress summary attached to a redeemed code, so researchers can see how the
// participant who used it is doing (rate, counts, mastery/completion) at a glance.
interface CodeProgress {
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
}

// GET ?educatorId= — list this educator's codes (newest first), with the redeeming
// participant's username and per-scenario progress for used codes.
export async function GET(request: NextRequest) {
  try {
    const educatorId = new URL(request.url).searchParams.get('educatorId');
    if (!educatorId) {
      return NextResponse.json({ error: 'educatorId is required' }, { status: 400 });
    }
    const codes = await db.query.accessCodes.findMany({
      where: eq(accessCodes.educatorId, educatorId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    const usedUserIds = [...new Set(codes.map((c) => c.usedByUserId).filter((v): v is string => !!v))];

    // Redeeming participants' usernames.
    const userRows = usedUserIds.length
      ? await db.query.users.findMany({
          where: inArray(users.id, usedUserIds),
          columns: { id: true, username: true },
        })
      : [];
    const usernameById = new Map(userRows.map((u) => [u.id, u.username]));

    // This educator's scenarios (ordered) + those participants' progress rows.
    const scenarioRows = await db.query.scenarios.findMany({
      where: eq(scenarios.userId, educatorId),
      columns: { id: true, name: true },
      orderBy: (t, { asc }) => [asc(t.id)],
    });
    const scenarioIds = scenarioRows.map((s) => s.id);
    const progressRows = usedUserIds.length && scenarioIds.length
      ? await db.query.scenarioProgress.findMany({
          where: and(
            inArray(scenarioProgress.userId, usedUserIds),
            inArray(scenarioProgress.scenarioId, scenarioIds)
          ),
        })
      : [];
    const progressByUser = new Map<string, Map<number, (typeof progressRows)[number]>>();
    for (const p of progressRows) {
      if (!progressByUser.has(p.userId)) progressByUser.set(p.userId, new Map());
      progressByUser.get(p.userId)!.set(p.scenarioId, p);
    }

    const enriched = codes.map((c) => {
      let progress: CodeProgress[] | null = null;
      if (c.usedByUserId) {
        const byScenario = progressByUser.get(c.usedByUserId);
        progress = scenarioRows.map((s) => {
          const p = byScenario?.get(s.id);
          return {
            scenarioId: s.id,
            scenarioName: s.name,
            protectiveRate: p?.protectiveRate ?? null,
            protectiveCount: p?.protectiveCount ?? 0,
            neutralCount: p?.neutralCount ?? 0,
            vulnerableCount: p?.vulnerableCount ?? 0,
            masteryReachedAt: p?.masteryReachedAt ? p.masteryReachedAt.getTime() : null,
            completedAt: p?.completedAt ? p.completedAt.getTime() : null,
            comfortExitAt: p?.comfortExitAt ? p.comfortExitAt.getTime() : null,
            visitCount: p?.visitCount ?? 0,
            lastVisitedAt: p?.lastVisitedAt ? p.lastVisitedAt.getTime() : null,
          };
        });
      }
      return {
        ...c,
        usedByUsername: c.usedByUserId ? (usernameById.get(c.usedByUserId) ?? null) : null,
        progress,
      };
    });

    return NextResponse.json({ codes: enriched });
  } catch (error) {
    console.error('Error listing access codes:', error);
    return NextResponse.json({ error: 'Failed to list access codes' }, { status: 500 });
  }
}

// POST { educatorId, code?, participantLabel?, count? } — create one specific code, or
// generate `count` random ones. Returns the educator's full (refreshed) code list.
export async function POST(request: NextRequest) {
  try {
    const { educatorId, code, participantLabel, count } = await request.json();
    if (!educatorId) {
      return NextResponse.json({ error: 'educatorId is required' }, { status: 400 });
    }
    const label = typeof participantLabel === 'string' ? participantLabel.trim() : '';

    if (typeof code === 'string' && code.trim()) {
      const c = code.trim();
      const existing = await db.query.accessCodes.findFirst({ where: eq(accessCodes.code, c) });
      if (existing) {
        return NextResponse.json({ error: 'That code already exists' }, { status: 409 });
      }
      await db.insert(accessCodes).values({ code: c, educatorId, participantLabel: label });
    } else {
      const n = Math.min(Math.max(1, typeof count === 'number' ? count : 1), 50);
      for (let i = 0; i < n; i++) {
        let c = genCode();
        for (let attempt = 0; attempt < 5; attempt++) {
          const existing = await db.query.accessCodes.findFirst({ where: eq(accessCodes.code, c) });
          if (!existing) break;
          c = genCode();
        }
        await db.insert(accessCodes).values({ code: c, educatorId, participantLabel: label });
      }
    }

    // The client re-fetches the (enriched) list via GET after a create.
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating access codes:', error);
    return NextResponse.json({ error: 'Failed to create access codes' }, { status: 500 });
  }
}

// DELETE ?id=&educatorId= — remove a code (scoped to the educator).
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const educatorId = searchParams.get('educatorId');
    if (!id || !educatorId) {
      return NextResponse.json({ error: 'id and educatorId are required' }, { status: 400 });
    }
    await db.delete(accessCodes).where(and(eq(accessCodes.id, id), eq(accessCodes.educatorId, educatorId)));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting access code:', error);
    return NextResponse.json({ error: 'Failed to delete access code' }, { status: 500 });
  }
}
