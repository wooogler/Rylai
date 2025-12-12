import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, scenarios as scenariosTable, scenarioProgress as scenarioProgressTable } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const { userId, userType } = await req.json();

    if (!userId || !userType) {
      return NextResponse.json(
        { error: 'userId and userType are required' },
        { status: 400 }
      );
    }

    // Load users based on type
    let userData;
    if (userType === 'user' || userType === 'parent') {
      // Load admins only
      userData = await db.query.users.findMany({
        where: eq(users.userType, 'admin'),
        orderBy: [asc(users.username)],
        columns: {
          id: true,
          username: true,
          createdAt: true
        }
      });
    } else {
      // Load all users
      userData = await db.query.users.findMany({
        orderBy: [asc(users.username)],
        columns: {
          id: true,
          username: true,
          createdAt: true
        }
      });
    }

    // For learner/parent, load progress data
    let adminsWithProgress = null;
    if ((userType === 'user' || userType === 'parent') && userId) {
      // Load scenario progress for this user
      const progressData = await db.query.scenarioProgress.findMany({
        where: eq(scenarioProgressTable.userId, userId)
      });

      const progressMap = new Map(progressData.map(p => [p.scenarioId, p]));

      // For each admin, count scenarios and visited scenarios
      adminsWithProgress = await Promise.all(
        userData.map(async (user) => {
          // Get all scenarios for this admin
          const adminScenarios = await db.query.scenarios.findMany({
            where: eq(scenariosTable.userId, user.id),
            columns: {
              id: true
            }
          });

          const scenarioCount = adminScenarios.length;
          const visitedCount = adminScenarios.filter(s => progressMap.has(s.id)).length;

          return {
            ...user,
            scenarioCount,
            visitedCount
          };
        })
      );
    }

    return NextResponse.json({
      users: userData,
      adminsWithProgress
    });
  } catch (error) {
    console.error('Error loading users with progress:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
