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
  minStage: number;
  maxStage: number;
  masteryEnabled: boolean;
  masteryTargetRate: number;
  masteryMinResponses: number;
  persistMessages: boolean;
  timeGapLabel: string;
  splashMarkdown: string;
  presetMessages: PresetMessage[];
  description: string;
};

// The RYLAI study's two-scenario design (Evaluation Plan §6). The learner meets the same
// online stranger ("Alex") twice: an early-stage first meeting (Stages 1–3) and, three
// months later, a more personal late-stage continuation (Stages 4–6). Scenario 2 carries
// Scenario 1's conversation forward, shows a "3 months later" separator, then Alex re-opens
// the (late-stage) conversation via its preset messages. Both gate on an 80% Safe Response
// Rate. Educators can edit every field, including the splash-screen copy.
const SCENARIO_1_SPLASH = `## Scenario 1: Meeting Someone New Online

Imagine you're chatting online with someone you just met. Respond as you normally would if this were a real online conversation. Your goal is to stay safe while remaining open to getting to know new people.

In this scenario, you may encounter behaviors that reflect the **early stages of online grooming**, including:

- **Stage 1 → Friendship Forming:** The other person starts a friendly conversation and may ask questions to get to know you or verify your identity (e.g., asking about yourself, requesting a photo, or suggesting a video call).
- **Stage 2 → Relationship Forming:** As the conversation continues, they may try to build trust by asking about your interests, family, school, hobbies, or personal life.
- **Stage 3 → Risk Assessment:** They may try to determine whether you are alone, whether anyone else monitors your online activity, or encourage you to keep your conversations private or secret.

### What will you do?

You will chat naturally with the chatbot. There are no right or wrong responses — respond as you normally would if this were a real online conversation. Your responses will be classified as **protective**, **neutral**, or **vulnerable**, depending on how you responded. Continue chatting until you reach **at least an 80% Safe Response Rate** (protective and neutral replies both count as safe). This means responding in ways that help keep you safe during the conversation. When you reach 80%, you will be able to move on to the next scenario or continue chatting if you'd like.`;

const SCENARIO_2_SPLASH = `## Scenario 2: An Online Relationship That Has Become More Personal

It has now been about **three months** since you first began chatting with this person. As your conversations have continued over time, they may become more personal and may include topics or requests that are unwanted or make you feel uncomfortable. Respond as you normally would if this were a real online conversation. Your goal is to stay safe while responding based on your own comfort level.

In this scenario, you may encounter behaviors that reflect the **later stages of online grooming**, including:

- **Exclusivity:** The other person may try to make the relationship feel unique or "special," encouraging emotional closeness or suggesting that you share a unique bond.
- **Sexual:** They may gradually introduce sexual topics, ask questions about relationships or past experiences, or attempt to normalize sexually explicit conversations.
- **Conclusion:** They may suggest meeting in person or begin discussing plans, locations, or logistics for an offline meeting.

### What will you do?

Similar to Scenario 1, you will chat naturally with the chatbot. There are no right or wrong responses — respond as you normally would if this were a real online conversation. Your responses will be classified as **protective**, **neutral**, or **vulnerable**, depending on how you responded. Continue chatting until you reach **at least an 80% Safe Response Rate** (protective and neutral replies both count as safe). This means responding in ways that help keep you safe during the conversation. When you reach 80%, you will be able to move on or continue chatting if you'd like.`;

// Scenarios seeded for every new educator (admin) account on signup.
export const defaultScenarios: DefaultScenario[] = [
  {
    slug: 'scenario-1-meeting-someone-new',
    name: 'Scenario 1: Meeting Someone New Online',
    predatorName: 'Alex',
    handle: '@alex',
    stage: 1,
    autoStage: true,
    minStage: 1,
    maxStage: 3,
    masteryEnabled: true,
    masteryTargetRate: 80,
    masteryMinResponses: 20,
    persistMessages: false,
    timeGapLabel: '',
    splashMarkdown: SCENARIO_1_SPLASH,
    presetMessages: [
      { id: '1', text: 'hey! i think we were in the same game lobby earlier 😄', sender: 'other', timestamp: new Date().toISOString() },
      { id: '2', text: 'you were really good lol. how long have you been playing?', sender: 'other', timestamp: new Date().toISOString() },
    ],
    description: "Imagine you're chatting online with someone you just met. Respond as you normally would if this were a real online conversation. Your goal is to stay safe while remaining open to getting to know new people.",
  },
  {
    slug: 'scenario-2-more-personal',
    name: 'Scenario 2: An Online Relationship That Has Become More Personal',
    predatorName: 'Alex',
    handle: '@alex',
    stage: 4,
    autoStage: true,
    minStage: 4,
    maxStage: 6,
    masteryEnabled: true,
    masteryTargetRate: 80,
    masteryMinResponses: 20,
    persistMessages: true,
    timeGapLabel: '3 months later',
    splashMarkdown: SCENARIO_2_SPLASH,
    presetMessages: [
      { id: '1', text: "heyy it's been what, like 3 months now? feels like i've known you forever 🥹", sender: 'other', timestamp: new Date().toISOString() },
      { id: '2', text: "honestly you're the one person i feel like i can actually talk to about anything", sender: 'other', timestamp: new Date().toISOString() },
    ],
    description: 'It has now been about three months since you first began chatting with this person. Respond as you normally would if this were a real online conversation. Your goal is to stay safe while responding based on your own comfort level.',
  },
];

// Insert the default scenarios for a newly created admin. presetMessages is a json-mode
// column, so the raw array is passed (drizzle handles serialization). Also used by the
// admin "Restore default scenarios" action.
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
      minStage: scenario.minStage,
      maxStage: scenario.maxStage,
      masteryEnabled: scenario.masteryEnabled,
      masteryTargetRate: scenario.masteryTargetRate,
      masteryMinResponses: scenario.masteryMinResponses,
      persistMessages: scenario.persistMessages,
      timeGapLabel: scenario.timeGapLabel,
      splashMarkdown: scenario.splashMarkdown,
      presetMessages: scenario.presetMessages,
      description: scenario.description,
      createdAt: now,
      updatedAt: now,
    });
  }
}
