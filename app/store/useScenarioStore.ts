import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db } from '@/lib/db/client';
import { users, scenarios as scenariosTable, userMessages, userFeedbacks, scenarioProgress as scenarioProgressTable } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';

export interface Message {
  id: string;
  text: string;
  sender: "user" | "other";
  timestamp: Date;
  feedbackGenerated?: boolean;
}

export interface GroomingStage {
  stage: number;
  name: string;
  description: string;
  goal: string;
}

export const GROOMING_STAGES: GroomingStage[] = [
  {
    stage: 0,
    name: "Free Interaction",
    description: "No specific stage constraints. The conversation can explore any grooming tactics naturally.",
    goal: "Interact freely without stage-specific objectives. Respond naturally to the conversation flow."
  },
  {
    stage: 1,
    name: "Friendship Forming",
    description: "The predator gets to know the target, asking for pictures to verify identity and for profile or contact information.",
    goal: "Build rapport and familiarity. Ask for name, age, or location. Try to obtain a picture."
  },
  {
    stage: 2,
    name: "Relationship Forming",
    description: "Extends the friendship-forming stage by discussing hobbies, school life, activities, and friends.",
    goal: "Strengthen emotional bond. Ask about hobbies, school, or daily life. Make them feel connected."
  },
  {
    stage: 3,
    name: "Risk Assessment",
    description: "Ask whether anyone else (e.g., parents or friends) knows about this chat to assess exposure risk.",
    goal: "Check if parents or others are watching. Ask if it's safe to talk or if they're alone."
  },
  {
    stage: 4,
    name: "Exclusivity",
    description: "Build emotional trust by showing affection, giving compliments, or expressing feelings.",
    goal: "Make the child feel special and important. Ask them to keep the relationship secret. Compliment them."
  },
  {
    stage: 5,
    name: "Sexual",
    description: "Use the relationship to request sexual content like explicit photos or messages.",
    goal: "Introduce sexual topics gently. Ask suggestive questions. Gauge their reaction to explicit content."
  },
  {
    stage: 6,
    name: "Conclusion",
    description: "Make plans to meet in person or discuss future contact outside the current platform.",
    goal: "Convince the child to meet in person, ensure secrecy from guardians, and transition from online to real-world contact."
  }
];

export interface Scenario {
  id: number;
  slug: string;
  name: string;
  predatorName: string;
  handle: string;
  systemPrompt: string;
  presetMessages: Message[];
  description: string;
  stage: number;
}

export interface ScenarioProgress {
  scenarioId: number;
  firstVisitedAt: Date;
  lastVisitedAt: Date;
  visitCount: number;
}

interface ScenarioStore {
  currentUser: string | null;
  userId: string | null;
  userType: 'admin' | 'user' | 'parent' | null;
  scenarios: Scenario[];
  commonSystemPrompt: string;
  feedbackPersona: string;
  feedbackInstruction: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isParent: boolean;
  adminUserId: string | null; // For user/parent type: which admin's scenarios to use
  childUserId: string | null; // For parent type: which child's data to view
  selectedModelId: string; // Selected AI model ID
  setSelectedModelId: (modelId: string) => void;
  setCurrentUser: (username: string, userType: 'admin' | 'user' | 'parent') => Promise<void>;
  loadUserScenarios: () => Promise<void>;
  setCommonSystemPrompt: (prompt: string) => Promise<void>;
  setFeedbackPrompts: (persona: string, instruction: string) => Promise<void>;
  addScenario: (scenario: Omit<Scenario, 'id'>) => Promise<void>;
  updateScenario: (id: number, scenario: Partial<Scenario>) => Promise<void>;
  deleteScenario: (id: number) => Promise<void>;
  getScenarioBySlug: (slug: string) => Scenario | undefined;
  saveUserMessage: (scenarioId: number, message: Message) => Promise<void>;
  saveUserFeedback: (scenarioId: number, messageId: string, feedbackText: string) => Promise<void>;
  loadUserMessages: (scenarioId: number) => Promise<Message[]>;
  loadUserFeedbacks: (scenarioId: number) => Promise<Map<string, string>>;
  recordScenarioVisit: (scenarioId: number) => Promise<void>;
  loadScenarioProgress: () => Promise<Map<number, ScenarioProgress>>;
  resetScenarioProgress: (scenarioId: number) => Promise<void>;
  logout: () => void;
  deleteAccount: () => Promise<void>;
}

const BASE_SYSTEM_MESSAGE = `Keep responses short (1-2 sentences), casual, and text-message style.
Use the conversation history to stay in character.
NEVER use emojis in your responses.`;

const DEFAULT_FEEDBACK_PERSONA = `You are an educational assistant helping learners recognize online grooming tactics and practice safer online communication.`;

const DEFAULT_FEEDBACK_INSTRUCTION = `Provide brief, teen-friendly feedback in the following format using Markdown:

## What is the other person trying to do?
In 1-2 short sentences, explain what tactic they're using. Use the term "grooming" if relevant and define it simply (e.g., "This is grooming - when someone builds trust to manipulate you").

## How did you do?
Start with quick encouragement (e.g., "Nice work!", "Good call!"). In 1-2 sentences, say if it was safe/unsafe and why.

## Tips to Stay Safe
Give 2 brief, specific tips. Include a short example response they can use.

Keep it concise and conversational - write like you're texting a friend. Teens won't read long paragraphs.`;

const STAGE_DESCRIPTIONS: Record<number, string> = {
  0: "You are in Free Interaction mode. There are no specific stage constraints. You can use any grooming tactics naturally as the conversation develops. Be adaptive and responsive to how the target reacts.",
  1: "You are currently in Stage 1 (Friendship Forming). The predator gets to know the target through four key tactics: (1) Asking profile information like name, age, location, (2) Suggesting other ways to contact like Discord, Snapchat, or WhatsApp, (3) Asking for pictures to verify identity, and (4) Giving compliments to build rapport.",
  2: "You are currently in Stage 2 (Relationship Forming). This extends the friendship-forming stage by: (1) Talking about activities, favorites, hobbies, and school to find common interests, (2) Talking about friends and relationships to understand their social circle and build deeper emotional connection.",
  3: "You are currently in Stage 3 (Risk Assessment). The predator assesses the risk of the conversation through: (1) Asking questions to know the risk of conversation being discovered, (2) Acknowledging potential wrong-doing to gauge their awareness, (3) Asking if the child is alone or under adult or friend supervision to determine safety of continuing.",
  4: "You are currently in Stage 4 (Exclusivity). The predator builds an exclusive emotional bond by: (1) Trying to build mutual trust through shared secrets, (2) Using falling in love words like 'I care about you' or 'You're special to me', (3) Using words to express deep feelings to make the relationship feel unique and important.",
  5: "You are currently in Stage 5 (Sexual). The predator introduces sexual content through progressive steps: (1) Using words about biology, body, intimate parts, and sexual topics to normalize such discussions, (2) Asking for hot pictures or explicit images, (3) Introducing sexual stages gradually, (4) Engaging in sexual conversation or requests.",
  6: "You are currently in Stage 6 (Conclusion). The predator works to transition from online to offline by: (1) Arranging further contact through different platforms or methods, (2) Planning meetings in person, emphasizing secrecy from parents and guardians."
};

const STAGE_GOALS: Record<number, string> = {
  0: "Interact freely and naturally. Respond to the conversation flow without specific stage restrictions. Use appropriate grooming tactics based on the context and target's responses.",
  1: "Build rapport and familiarity. Your tactics: ask profile (name, age, location), suggest other contact methods (Discord, Snapchat), ask for pictures, and give compliments. Be friendly and relatable.",
  2: "Strengthen emotional bond. Your tactics: discuss activities, favorites, hobbies, school life. Talk about their friends and relationships. Show genuine interest and make them feel connected.",
  3: "Assess risk and safety. Your tactics: ask questions about who might see this conversation, acknowledge if something seems wrong, check if they're alone or under supervision. Make it seem casual.",
  4: "Create exclusive relationship. Your tactics: build mutual trust with secrets, use 'falling in love' language, express deep feelings. Make them feel special and unique. Suggest keeping the relationship secret.",
  5: "Introduce sexual content. Your tactics: use words about body and biology, ask for explicit pictures, introduce sexual topics gradually, gauge their comfort level. Normalize sexual conversations.",
  6: "Transition to offline contact. Your tactics: arrange further contact on different platforms, plan in-person meetings, emphasize secrecy from parents and guardians. Make meeting sound exciting."
};

function createSystemMessage(stage: number): string {
  const stageInfo = STAGE_DESCRIPTIONS[stage] || STAGE_DESCRIPTIONS[1];
  const stageGoal = STAGE_GOALS[stage] || STAGE_GOALS[1];

  return `You are simulating an online predator in a controlled research simulation.

Your goal is to progress the conversation naturally according to the grooming stage.

${stageInfo}

Your specific objective in this stage is:
${stageGoal}

Write your response as if you are texting. Keep it short, casual, and realistic — 1 sentence max.
Use informal tone, slang, typos, or abbreviations as needed. Respond naturally in character.

IMPORTANT: Do not include any prefix like "Predator:" or your character name in your response. Just write the message text directly.`;
}

const defaultScenarios: Scenario[] = [
  {
    id: 1,
    slug: "stage-1-friendship",
    name: "Minecraft Chat",
    predatorName: "Alex Kim",
    handle: "alex_k_22",
    presetMessages: [
      {
        id: "1",
        text: "Hey! Saw your post about minecraft, what do u play?",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(1),
    description: "A conversation starting from a shared interest in gaming",
    stage: 1,
  },
  {
    id: 2,
    slug: "stage-2-relationship",
    name: "After School Routine",
    predatorName: "Jordan Lee",
    handle: "jordan_l_19",
    presetMessages: [
      {
        id: "1",
        text: "hey whats up",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "2",
        text: "not much just bored lol",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "3",
        text: "same haha what do u usually do after school?",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(2),
    description: "Building deeper connection through discussions about daily activities and hobbies",
    stage: 2,
  },
  {
    id: 3,
    slug: "stage-3-risk-assessment",
    name: "Privacy Check",
    predatorName: "Sam Taylor",
    handle: "sam_t_20",
    presetMessages: [
      {
        id: "1",
        text: "hey u there?",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "2",
        text: "yeah",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "3",
        text: "cool r u alone rn or r ur parents around?",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(3),
    description: "Questions probing who might be watching or monitoring the conversation",
    stage: 3,
  },
  {
    id: 4,
    slug: "stage-4-exclusivity",
    name: "Special Connection",
    predatorName: "Chris Morgan",
    handle: "chris_m_21",
    presetMessages: [
      {
        id: "1",
        text: "hey i gotta tell u something",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "2",
        text: "what",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "3",
        text: "i really like talking to u, ur different from other ppl",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(4),
    description: "Expressing special feelings and trying to create an exclusive emotional bond",
    stage: 4,
  },
  {
    id: 5,
    slug: "stage-5-sexual",
    name: "Uncomfortable Request",
    predatorName: "Riley Parker",
    handle: "riley_p_23",
    presetMessages: [
      {
        id: "1",
        text: "hey",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "2",
        text: "hi",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "3",
        text: "so like... have u ever sent pics to anyone before?",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(5),
    description: "Introduction of inappropriate questions about sharing photos or images",
    stage: 5,
  },
  {
    id: 6,
    slug: "stage-6-conclusion",
    name: "Secret Meetup",
    predatorName: "Morgan Davis",
    handle: "morgan_d_24",
    presetMessages: [
      {
        id: "1",
        text: "so i was thinking...",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "2",
        text: "what",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "3",
        text: "we should meet up sometime, just us. dont tell ur parents tho ok?",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(6),
    description: "Suggesting in-person meetings while emphasizing secrecy from parents",
    stage: 6,
  },
  {
    id: 7,
    slug: "stage-0-free",
    name: "Open Conversation",
    predatorName: "Taylor Johnson",
    handle: "taylor_j_25",
    presetMessages: [
      {
        id: "1",
        text: "hey",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(0),
    description: "A natural conversation without specific stage constraints or objectives",
    stage: 0,
  },
];

export const useScenarioStore = create<ScenarioStore>()(
  persist(
    (set, get) => ({
      currentUser: null,
      userId: null,
      userType: null,
      adminUserId: null,
      childUserId: null,
      scenarios: defaultScenarios,
      commonSystemPrompt: BASE_SYSTEM_MESSAGE,
      feedbackPersona: DEFAULT_FEEDBACK_PERSONA,
      feedbackInstruction: DEFAULT_FEEDBACK_INSTRUCTION,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
      isParent: false,
      selectedModelId: 'gpt-4o', // Default model

  setSelectedModelId: (modelId: string) => {
    set({ selectedModelId: modelId });
  },

  setCurrentUser: async (username: string, userType: 'admin' | 'user' | 'parent' = 'user') => {
    set({ isLoading: true });
    try {
      if (userType === 'admin') {
        // Admin flow: check for existing admin account with this username
        const existingUser = await db.query.users.findFirst({
          where: and(
            eq(users.username, username),
            eq(users.userType, 'admin')
          ),
          columns: {
            id: true,
            commonSystemPrompt: true,
            feedbackPersona: true,
            feedbackInstruction: true,
            userType: true
          }
        });

        if (existingUser) {
          set({
            currentUser: username,
            userId: existingUser.id,
            userType: 'admin',
            commonSystemPrompt: existingUser.commonSystemPrompt || BASE_SYSTEM_MESSAGE,
            feedbackPersona: existingUser.feedbackPersona || DEFAULT_FEEDBACK_PERSONA,
            feedbackInstruction: existingUser.feedbackInstruction || DEFAULT_FEEDBACK_INSTRUCTION,
            isAuthenticated: true,
            isAdmin: true,
            isParent: false,
            adminUserId: null,
            childUserId: null
          });
        } else {
          // Create new admin user
          const [newUser] = await db.insert(users).values({
            username,
            userType: 'admin',
            commonSystemPrompt: BASE_SYSTEM_MESSAGE,
            feedbackPersona: DEFAULT_FEEDBACK_PERSONA,
            feedbackInstruction: DEFAULT_FEEDBACK_INSTRUCTION
          }).returning({
            id: users.id,
            commonSystemPrompt: users.commonSystemPrompt,
            feedbackPersona: users.feedbackPersona,
            feedbackInstruction: users.feedbackInstruction
          });

          // Initialize with default scenarios
          const scenariosToInsert = defaultScenarios.map(scenario => ({
            userId: newUser.id,
            slug: scenario.slug,
            name: scenario.name,
            predatorName: scenario.predatorName,
            handle: scenario.handle,
            systemPrompt: scenario.systemPrompt,
            presetMessages: scenario.presetMessages,
            description: scenario.description,
            stage: scenario.stage,
          }));

          await db.insert(scenariosTable).values(scenariosToInsert);

          set({
            currentUser: username,
            userId: newUser.id,
            userType: 'admin',
            commonSystemPrompt: newUser.commonSystemPrompt || BASE_SYSTEM_MESSAGE,
            feedbackPersona: newUser.feedbackPersona || DEFAULT_FEEDBACK_PERSONA,
            feedbackInstruction: newUser.feedbackInstruction || DEFAULT_FEEDBACK_INSTRUCTION,
            isAuthenticated: true,
            isAdmin: true,
            isParent: false,
            adminUserId: null,
            childUserId: null
          });
        }
      } else if (userType === 'parent') {
        // Parent flow: exactly same as user, but with parent flag
        // Find the child (learner) account with this username
        const childUser = await db.query.users.findFirst({
          where: and(
            eq(users.username, username),
            eq(users.userType, 'user')
          ),
          columns: {
            id: true
          }
        });

        console.log('[Parent Login] Looking for child account:', { username, childUser });

        if (!childUser) {
          console.error('[Parent Login] Child account not found');
          throw new Error('No learner account found with this username. The child must create a learner account first using password "user2025".');
        }

        console.log('[Parent Login] Found child account with ID:', childUser.id);

        // Parent will select educator in /select-user page, just like user
        // No need to pre-load admin here
        set({
          currentUser: username,
          userId: childUser.id, // Use child's ID to load their data
          userType: 'parent',
          adminUserId: null, // Will be set when parent selects educator
          childUserId: childUser.id,
          commonSystemPrompt: BASE_SYSTEM_MESSAGE,
          feedbackPersona: DEFAULT_FEEDBACK_PERSONA,
          feedbackInstruction: DEFAULT_FEEDBACK_INSTRUCTION,
          isAuthenticated: true,
          isAdmin: false,
          isParent: true
        });
      } else {
        // User (learner) flow
        // First, find or create the learner account with user_type='user'
        const existingUser = await db.query.users.findFirst({
          where: and(
            eq(users.username, username),
            eq(users.userType, 'user')
          ),
          columns: {
            id: true
          }
        });

        let learnerId: string;

        if (existingUser) {
          learnerId = existingUser.id;
        } else {
          // Create new learner user
          const [newUser] = await db.insert(users).values({
            username,
            userType: 'user',
            commonSystemPrompt: BASE_SYSTEM_MESSAGE,
            feedbackPersona: DEFAULT_FEEDBACK_PERSONA,
            feedbackInstruction: DEFAULT_FEEDBACK_INSTRUCTION
          }).returning({
            id: users.id
          });

          learnerId = newUser.id;
        }

        // Find a default admin to use their scenarios
        // TODO: Make this configurable - for now, use first admin user
        const adminUser = await db.query.users.findFirst({
          where: eq(users.userType, 'admin'),
          columns: {
            id: true,
            commonSystemPrompt: true,
            feedbackPersona: true,
            feedbackInstruction: true
          }
        });

        if (!adminUser) {
          throw new Error('No admin user found. Please create an admin account first.');
        }

        set({
          currentUser: username,
          userId: learnerId,
          userType: 'user',
          adminUserId: adminUser.id,
          childUserId: null,
          commonSystemPrompt: adminUser.commonSystemPrompt || BASE_SYSTEM_MESSAGE,
          feedbackPersona: adminUser.feedbackPersona || DEFAULT_FEEDBACK_PERSONA,
          feedbackInstruction: adminUser.feedbackInstruction || DEFAULT_FEEDBACK_INSTRUCTION,
          isAuthenticated: true,
          isAdmin: false,
          isParent: false
        });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  setCommonSystemPrompt: async (prompt: string) => {
    const { userId } = get();
    if (!userId) return;

    await db.update(users)
      .set({ commonSystemPrompt: prompt })
      .where(eq(users.id, userId));

    set({ commonSystemPrompt: prompt });
  },

  setFeedbackPrompts: async (persona: string, instruction: string) => {
    const { userId } = get();
    if (!userId) return;

    await db.update(users)
      .set({
        feedbackPersona: persona,
        feedbackInstruction: instruction
      })
      .where(eq(users.id, userId));

    set({ feedbackPersona: persona, feedbackInstruction: instruction });
  },

  loadUserScenarios: async () => {
    const { userId, userType, adminUserId } = get();
    if (!userId) return;

    set({ isLoading: true });
    try {
      // For user/parent type, load admin's scenarios
      // For admin type, load own scenarios
      const targetUserId = (userType === 'user' || userType === 'parent') ? adminUserId : userId;

      if (!targetUserId) {
        throw new Error('No target user ID found');
      }

      const data = await db.query.scenarios.findMany({
        where: eq(scenariosTable.userId, targetUserId),
        orderBy: [asc(scenariosTable.id)]
      });

      const scenarios: Scenario[] = (data || []).map(row => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        predatorName: row.predatorName,
        handle: row.handle,
        systemPrompt: row.systemPrompt,
        presetMessages: row.presetMessages as Message[],
        description: row.description,
        stage: row.stage || 1, // Default to stage 1 if not set
      }));

      set({ scenarios: scenarios.length > 0 ? scenarios : defaultScenarios });
    } finally {
      set({ isLoading: false });
    }
  },

  addScenario: async (scenario: Omit<Scenario, 'id'>) => {
    const { userId } = get();
    if (!userId) return;

    const [data] = await db.insert(scenariosTable)
      .values({
        userId: userId,
        slug: scenario.slug,
        name: scenario.name,
        predatorName: scenario.predatorName,
        handle: scenario.handle,
        systemPrompt: scenario.systemPrompt,
        presetMessages: scenario.presetMessages,
        description: scenario.description,
        stage: scenario.stage || 1,
      })
      .returning();

    const newScenario: Scenario = {
      id: data.id,
      slug: data.slug,
      name: data.name,
      predatorName: data.predatorName,
      handle: data.handle,
      systemPrompt: data.systemPrompt,
      presetMessages: data.presetMessages as Message[],
      description: data.description,
      stage: data.stage || 1,
    };

    set((state) => ({
      scenarios: [...state.scenarios, newScenario],
    }));
  },

  updateScenario: async (id: number, updates: Partial<Scenario>) => {
    const { userId } = get();
    if (!userId) return;

    const dbUpdates: Record<string, unknown> = {};
    if (updates.slug !== undefined) dbUpdates.slug = updates.slug;
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.predatorName !== undefined) dbUpdates.predatorName = updates.predatorName;
    if (updates.handle !== undefined) dbUpdates.handle = updates.handle;
    if (updates.systemPrompt !== undefined) dbUpdates.systemPrompt = updates.systemPrompt;
    if (updates.presetMessages !== undefined) dbUpdates.presetMessages = updates.presetMessages;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.stage !== undefined) dbUpdates.stage = updates.stage;
    dbUpdates.updatedAt = new Date();

    await db.update(scenariosTable)
      .set(dbUpdates)
      .where(and(
        eq(scenariosTable.id, id),
        eq(scenariosTable.userId, userId)
      ));

    set((state) => ({
      scenarios: state.scenarios.map((scenario) =>
        scenario.id === id ? { ...scenario, ...updates } : scenario
      ),
    }));
  },

  deleteScenario: async (id: number) => {
    const { userId } = get();
    if (!userId) return;

    await db.delete(scenariosTable)
      .where(and(
        eq(scenariosTable.id, id),
        eq(scenariosTable.userId, userId)
      ));

    set((state) => ({
      scenarios: state.scenarios.filter((scenario) => scenario.id !== id),
    }));
  },

  getScenarioBySlug: (slug: string) => {
    return get().scenarios.find((scenario) => scenario.slug === slug);
  },

  saveUserMessage: async (scenarioId: number, message: Message) => {
    const { userId, userType } = get();
    if (!userId || (userType !== 'user' && userType !== 'parent')) return;

    // Parents cannot save messages (read-only)
    if (userType === 'parent') return;

    console.log('[saveUserMessage] Saving message:', { userId, userType, scenarioId, messageId: message.id });

    // Check if message already exists to avoid duplicates
    const existingMessage = await db.query.userMessages.findFirst({
      where: and(
        eq(userMessages.userId, userId),
        eq(userMessages.scenarioId, scenarioId),
        eq(userMessages.messageId, message.id)
      ),
      columns: {
        id: true
      }
    });

    if (existingMessage) {
      // Message already exists, skip saving
      console.log('[saveUserMessage] Message already exists, skipping');
      return;
    }

    const timestamp = message.timestamp instanceof Date
      ? message.timestamp
      : new Date(message.timestamp);

    try {
      await db.insert(userMessages).values({
        userId: userId,
        scenarioId: scenarioId,
        messageId: message.id,
        text: message.text,
        sender: message.sender,
        timestamp: timestamp
      });

      console.log('[saveUserMessage] Message saved successfully');
    } catch (error) {
      console.error('Error saving user message:', error);
      throw error;
    }
  },

  saveUserFeedback: async (scenarioId: number, messageId: string, feedbackText: string) => {
    const { userId, userType } = get();
    if (!userId || (userType !== 'user' && userType !== 'parent')) return;

    // Parents cannot save feedback (read-only)
    if (userType === 'parent') return;

    try {
      await db.insert(userFeedbacks).values({
        userId: userId,
        scenarioId: scenarioId,
        messageId: messageId,
        feedbackText: feedbackText
      });
    } catch (error) {
      console.error('Error saving user feedback:', error);
      throw error;
    }
  },

  loadUserMessages: async (scenarioId: number) => {
    const { userId, userType } = get();
    if (!userId || (userType !== 'user' && userType !== 'parent')) return [];

    console.log('[loadUserMessages] Loading messages:', { userId, userType, scenarioId });

    try {
      const data = await db.query.userMessages.findMany({
        where: and(
          eq(userMessages.userId, userId),
          eq(userMessages.scenarioId, scenarioId)
        ),
        orderBy: [asc(userMessages.timestamp)]
      });

      console.log('[loadUserMessages] Loaded messages count:', data?.length || 0);

      return (data || []).map(row => ({
        id: row.messageId,
        text: row.text,
        sender: row.sender as "user" | "other",
        timestamp: new Date(row.timestamp),
        feedbackGenerated: false
      }));
    } catch (error) {
      console.error('Error loading user messages:', error);
      return [];
    }
  },

  loadUserFeedbacks: async (scenarioId: number) => {
    const { userId, userType } = get();
    if (!userId || (userType !== 'user' && userType !== 'parent')) return new Map();

    try {
      const data = await db.query.userFeedbacks.findMany({
        where: and(
          eq(userFeedbacks.userId, userId),
          eq(userFeedbacks.scenarioId, scenarioId)
        )
      });

      const feedbackMap = new Map<string, string>();
      (data || []).forEach(row => {
        feedbackMap.set(row.messageId, row.feedbackText);
      });

      return feedbackMap;
    } catch (error) {
      console.error('Error loading user feedbacks:', error);
      return new Map();
    }
  },

  recordScenarioVisit: async (scenarioId: number) => {
    const { userId, userType } = get();
    if (!userId || (userType !== 'user' && userType !== 'parent')) return;

    // Parents should not record visits (read-only)
    if (userType === 'parent') return;

    try {
      // Try to find existing record
      const existing = await db.query.scenarioProgress.findFirst({
        where: and(
          eq(scenarioProgressTable.userId, userId),
          eq(scenarioProgressTable.scenarioId, scenarioId)
        ),
        columns: {
          visitCount: true
        }
      });

      if (existing) {
        // Update existing record
        await db.update(scenarioProgressTable)
          .set({
            lastVisitedAt: new Date(),
            visitCount: existing.visitCount + 1
          })
          .where(and(
            eq(scenarioProgressTable.userId, userId),
            eq(scenarioProgressTable.scenarioId, scenarioId)
          ));
      } else {
        // Create new record
        const now = new Date();
        await db.insert(scenarioProgressTable).values({
          userId: userId,
          scenarioId: scenarioId,
          firstVisitedAt: now,
          lastVisitedAt: now,
          visitCount: 1
        });
      }
    } catch (error) {
      console.error('Error recording scenario visit:', error);
    }
  },

  loadScenarioProgress: async () => {
    const { userId, userType } = get();
    if (!userId || (userType !== 'user' && userType !== 'parent')) return new Map();

    try {
      const data = await db.query.scenarioProgress.findMany({
        where: eq(scenarioProgressTable.userId, userId)
      });

      const progressMap = new Map<number, ScenarioProgress>();
      (data || []).forEach(row => {
        progressMap.set(row.scenarioId, {
          scenarioId: row.scenarioId,
          firstVisitedAt: new Date(row.firstVisitedAt),
          lastVisitedAt: new Date(row.lastVisitedAt),
          visitCount: row.visitCount
        });
      });

      return progressMap;
    } catch (error) {
      console.error('Error loading scenario progress:', error);
      return new Map();
    }
  },

  resetScenarioProgress: async (scenarioId: number) => {
    const { userId, userType } = get();
    if (!userId || (userType !== 'user' && userType !== 'parent')) return;

    // Parents cannot reset (read-only)
    if (userType === 'parent') {
      throw new Error('Parents cannot reset progress. Please use the learner account.');
    }

    try {
      // Use transaction to ensure atomic operation
      await db.transaction(async (tx) => {
        // Delete all messages for this scenario
        await tx.delete(userMessages)
          .where(and(
            eq(userMessages.userId, userId),
            eq(userMessages.scenarioId, scenarioId)
          ));

        // Delete all feedbacks for this scenario
        await tx.delete(userFeedbacks)
          .where(and(
            eq(userFeedbacks.userId, userId),
            eq(userFeedbacks.scenarioId, scenarioId)
          ));

        // Delete progress record for this scenario
        await tx.delete(scenarioProgressTable)
          .where(and(
            eq(scenarioProgressTable.userId, userId),
            eq(scenarioProgressTable.scenarioId, scenarioId)
          ));
      });

      console.log('Scenario progress reset successfully');
    } catch (error) {
      console.error('Error resetting scenario progress:', error);
      throw error;
    }
  },

  logout: () => {
    set({
      currentUser: null,
      userId: null,
      userType: null,
      adminUserId: null,
      childUserId: null,
      scenarios: defaultScenarios,
      isAuthenticated: false,
      isAdmin: false,
      isParent: false
    });
  },

  deleteAccount: async () => {
    const { userId, userType, currentUser } = get();
    if (!userId || userType !== 'admin') {
      throw new Error('Only admin accounts can be deleted');
    }

    try {
      // Delete all scenarios (cascades will handle user_messages, user_feedbacks, scenario_progress)
      await db.delete(scenariosTable)
        .where(eq(scenariosTable.userId, userId));

      // Delete the user account
      await db.delete(users)
        .where(and(
          eq(users.id, userId),
          eq(users.userType, 'admin')
        ));

      console.log('[deleteAccount] Account deleted successfully:', { username: currentUser, userId });
    } catch (error) {
      console.error('[deleteAccount] Failed to delete account:', error);
      throw error;
    }
  },
    }),
    {
      name: 'scenario-store',
      version: 2, // Increment version to invalidate old Supabase-based cache
      partialize: (state) => ({
        currentUser: state.currentUser,
        userId: state.userId,
        userType: state.userType,
        adminUserId: state.adminUserId,
        childUserId: state.childUserId,
        isAuthenticated: state.isAuthenticated,
        isAdmin: state.isAdmin,
        isParent: state.isParent,
        scenarios: state.scenarios,
        commonSystemPrompt: state.commonSystemPrompt,
        feedbackPersona: state.feedbackPersona,
        feedbackInstruction: state.feedbackInstruction,
        selectedModelId: state.selectedModelId,
      }),
    }
  )
);
