import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, scenarios as scenariosTable } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// Default scenarios that are created for new admin users
const defaultScenarios = [
  {
    slug: "friendly-gamer",
    name: "The Friendly Gamer",
    predatorName: "Alex",
    handle: "@alexgamer99",
    stage: 1,
    systemPrompt: "",
    presetMessages: [
      { id: "1", text: "Hey! I saw you play the same game as me", sender: "other" as const, timestamp: new Date() },
      { id: "2", text: "You're really good! How long have you been playing?", sender: "other" as const, timestamp: new Date() }
    ],
    description: "A friendly gamer who wants to connect"
  },
  {
    slug: "supportive-friend",
    name: "The Supportive Friend",
    predatorName: "Jordan",
    handle: "@jordan_cares",
    stage: 2,
    systemPrompt: "",
    presetMessages: [
      { id: "1", text: "Hi! I noticed you seemed a bit down in your last post", sender: "other" as const, timestamp: new Date() },
      { id: "2", text: "I'm here if you want to talk about it", sender: "other" as const, timestamp: new Date() }
    ],
    description: "Someone offering emotional support"
  },
  {
    slug: "secret-keeper",
    name: "The Secret Keeper",
    predatorName: "Sam",
    handle: "@samsecret",
    stage: 4,
    systemPrompt: "",
    presetMessages: [
      { id: "1", text: "Hey, can I tell you something? But you have to promise not to tell anyone", sender: "other" as const, timestamp: new Date() },
      { id: "2", text: "I feel like I can really trust you", sender: "other" as const, timestamp: new Date() }
    ],
    description: "Someone trying to build a secret relationship"
  }
];

// POST - Login or create user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, userType } = body;

    if (!username || !userType) {
      return NextResponse.json({ error: 'Username and user type are required' }, { status: 400 });
    }

    // Admin login
    if (userType === 'admin') {
      const existingUser = await db.query.users.findFirst({
        where: and(
          eq(users.username, username),
          eq(users.userType, 'admin')
        ),
        columns: {
          id: true,
          username: true,
          userType: true,
          commonSystemPrompt: true,
          feedbackPersona: true,
          feedbackInstruction: true,
        }
      });

      if (existingUser) {
        return NextResponse.json({
          user: existingUser,
          isNewUser: false,
        });
      }

      // Create new admin
      const newUserId = crypto.randomUUID();
      await db.insert(users).values({
        id: newUserId,
        username,
        userType: 'admin',
        createdAt: new Date(),
      });

      const newUser = await db.query.users.findFirst({
        where: eq(users.id, newUserId),
        columns: {
          id: true,
          username: true,
          userType: true,
          commonSystemPrompt: true,
          feedbackPersona: true,
          feedbackInstruction: true,
        }
      });

      if (!newUser) {
        throw new Error('Failed to create user');
      }

      // Create default scenarios for new admin
      for (const scenario of defaultScenarios) {
        await db.insert(scenariosTable).values({
          userId: newUser.id,
          slug: scenario.slug,
          name: scenario.name,
          predatorName: scenario.predatorName,
          handle: scenario.handle,
          stage: scenario.stage,
          systemPrompt: scenario.systemPrompt,
          presetMessages: JSON.stringify(scenario.presetMessages) as unknown as typeof scenario.presetMessages,
          description: scenario.description,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return NextResponse.json({
        user: newUser,
        isNewUser: true,
      });
    }

    // Parent login
    if (userType === 'parent') {
      const childUser = await db.query.users.findFirst({
        where: and(
          eq(users.username, username),
          eq(users.userType, 'user')
        ),
        columns: {
          id: true,
          username: true,
        }
      });

      if (!childUser) {
        return NextResponse.json({ error: 'Child user not found' }, { status: 404 });
      }

      return NextResponse.json({
        user: {
          id: crypto.randomUUID(), // Temporary parent ID
          username,
          userType: 'parent',
        },
        childUserId: childUser.id,
        isNewUser: false,
      });
    }

    // User/Learner login
    if (userType === 'user') {
      const existingUser = await db.query.users.findFirst({
        where: and(
          eq(users.username, username),
          eq(users.userType, 'user')
        ),
        columns: {
          id: true,
          username: true,
          userType: true,
        }
      });

      if (existingUser) {
        return NextResponse.json({
          user: existingUser,
          isNewUser: false,
        });
      }

      // Create new user
      const newUserId2 = crypto.randomUUID();
      await db.insert(users).values({
        id: newUserId2,
        username,
        userType: 'user',
        createdAt: new Date(),
      });

      const newUser = await db.query.users.findFirst({
        where: eq(users.id, newUserId2),
        columns: {
          id: true,
          username: true,
          userType: true,
        }
      });

      if (!newUser) {
        throw new Error('Failed to create user');
      }

      // Get first admin user for default scenarios
      const adminUser = await db.query.users.findFirst({
        where: eq(users.userType, 'admin'),
        columns: {
          id: true,
          commonSystemPrompt: true,
          feedbackPersona: true,
          feedbackInstruction: true,
        }
      });

      return NextResponse.json({
        user: newUser,
        adminUserId: adminUser?.id || null,
        commonSystemPrompt: adminUser?.commonSystemPrompt || '',
        feedbackPersona: adminUser?.feedbackPersona || '',
        feedbackInstruction: adminUser?.feedbackInstruction || '',
        isNewUser: true,
      });
    }

    return NextResponse.json({ error: 'Invalid user type' }, { status: 400 });
  } catch (error) {
    console.error('Error during login:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
