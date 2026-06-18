import { db } from '@/lib/db/client';
import { scenarios as scenariosTable } from '@/lib/db/schema';

type PresetMessage = {
  id: string;
  text: string;
  sender: 'user' | 'other';
  timestamp: string;
};

type DefaultScenario = {
  slug: string;
  name: string;
  predatorName: string;
  handle: string;
  stage: number;
  autoStage: boolean;
  presetMessages: PresetMessage[];
  description: string;
};

// Scenarios seeded for every new educator (admin) account on signup.
export const defaultScenarios: DefaultScenario[] = [
  {
    slug: 'friendly-gamer',
    name: 'The Friendly Gamer',
    predatorName: 'Alex',
    handle: '@alexgamer99',
    stage: 1,
    autoStage: true,
    presetMessages: [
      { id: '1', text: 'Hey! I saw you play the same game as me', sender: 'other', timestamp: new Date().toISOString() },
      { id: '2', text: "You're really good! How long have you been playing?", sender: 'other', timestamp: new Date().toISOString() },
    ],
    description: 'A friendly gamer who wants to connect',
  },
  {
    slug: 'supportive-friend',
    name: 'The Supportive Friend',
    predatorName: 'Jordan',
    handle: '@jordan_cares',
    stage: 2,
    autoStage: true,
    presetMessages: [
      { id: '1', text: 'Hi! I noticed you seemed a bit down in your last post', sender: 'other', timestamp: new Date().toISOString() },
      { id: '2', text: "I'm here if you want to talk about it", sender: 'other', timestamp: new Date().toISOString() },
    ],
    description: 'Someone offering emotional support',
  },
  {
    slug: 'secret-keeper',
    name: 'The Secret Keeper',
    predatorName: 'Sam',
    handle: '@samsecret',
    stage: 4,
    autoStage: true,
    presetMessages: [
      { id: '1', text: 'Hey, can I tell you something? But you have to promise not to tell anyone', sender: 'other', timestamp: new Date().toISOString() },
      { id: '2', text: 'I feel like I can really trust you', sender: 'other', timestamp: new Date().toISOString() },
    ],
    description: 'Someone trying to build a secret relationship',
  },
];

// Insert the default scenarios for a newly created admin. presetMessages is a
// json-mode column, so the raw array is passed (drizzle handles serialization).
export async function createDefaultScenarios(userId: string): Promise<void> {
  const now = new Date();
  for (const scenario of defaultScenarios) {
    await db.insert(scenariosTable).values({
      userId,
      slug: scenario.slug,
      name: scenario.name,
      predatorName: scenario.predatorName,
      handle: scenario.handle,
      stage: scenario.stage,
      autoStage: scenario.autoStage,
      masteryThreshold: 5,
      presetMessages: scenario.presetMessages,
      description: scenario.description,
      createdAt: now,
      updatedAt: now,
    });
  }
}
