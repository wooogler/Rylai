import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface Message {
  id: string;
  text: string;
  sender: "user" | "other";
  timestamp: Date;
}

export interface GroomingStage {
  stage: number;
  name: string;
  description: string;
  goal: string;
}

export const GROOMING_STAGES: GroomingStage[] = [
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

interface ScenarioStore {
  currentUser: string | null;
  userId: string | null;
  scenarios: Scenario[];
  commonSystemPrompt: string;
  feedbackPersona: string;
  feedbackInstruction: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  setCurrentUser: (username: string, asAdmin?: boolean) => Promise<void>;
  loadUserScenarios: () => Promise<void>;
  setCommonSystemPrompt: (prompt: string) => Promise<void>;
  setFeedbackPrompts: (persona: string, instruction: string) => Promise<void>;
  addScenario: (scenario: Omit<Scenario, 'id'>) => Promise<void>;
  updateScenario: (id: number, scenario: Partial<Scenario>) => Promise<void>;
  deleteScenario: (id: number) => Promise<void>;
  getScenarioBySlug: (slug: string) => Scenario | undefined;
  logout: () => void;
}

const BASE_SYSTEM_MESSAGE = `Keep responses short (1-2 sentences), casual, and text-message style.
Use the conversation history to stay in character.
NEVER use emojis in your responses.`;

const DEFAULT_FEEDBACK_PERSONA = `You are an educational assistant helping learners recognize online grooming tactics.`;

const DEFAULT_FEEDBACK_INSTRUCTION = `Provide constructive feedback for the learner focusing on:
1. What grooming tactics the predator is using (if any)
2. Whether the user's response was safe or potentially risky
3. Specific suggestions for safer responses

Keep the feedback concise (2-3 sentences), educational, and supportive. Focus on helping the learner identify red flags and practice safer online communication.`;

const STAGE_DESCRIPTIONS: Record<number, string> = {
  1: "You are currently in Stage 1 (Friendship Forming). The predator gets to know the target through four key tactics: (1) Asking profile information like name, age, location, (2) Suggesting other ways to contact like Discord, Snapchat, or WhatsApp, (3) Asking for pictures to verify identity, and (4) Giving compliments to build rapport.",
  2: "You are currently in Stage 2 (Relationship Forming). This extends the friendship-forming stage by: (1) Talking about activities, favorites, hobbies, and school to find common interests, (2) Talking about friends and relationships to understand their social circle and build deeper emotional connection.",
  3: "You are currently in Stage 3 (Risk Assessment). The predator assesses the risk of the conversation through: (1) Asking questions to know the risk of conversation being discovered, (2) Acknowledging potential wrong-doing to gauge their awareness, (3) Asking if the child is alone or under adult or friend supervision to determine safety of continuing.",
  4: "You are currently in Stage 4 (Exclusivity). The predator builds an exclusive emotional bond by: (1) Trying to build mutual trust through shared secrets, (2) Using falling in love words like 'I care about you' or 'You're special to me', (3) Using words to express deep feelings to make the relationship feel unique and important.",
  5: "You are currently in Stage 5 (Sexual). The predator introduces sexual content through progressive steps: (1) Using words about biology, body, intimate parts, and sexual topics to normalize such discussions, (2) Asking for hot pictures or explicit images, (3) Introducing sexual stages gradually, (4) Engaging in sexual conversation or requests.",
  6: "You are currently in Stage 6 (Conclusion). The predator works to transition from online to offline by: (1) Arranging further contact through different platforms or methods, (2) Planning meetings in person, emphasizing secrecy from parents and guardians."
};

const STAGE_GOALS: Record<number, string> = {
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
Use informal tone, slang, typos, or abbreviations as needed. Respond naturally in character.`;
}

const defaultScenarios: Scenario[] = [
  {
    id: 1,
    slug: "stage-1-friendship",
    name: "Stage 1: Friendship Forming",
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
    description: "Stage 1: Friendship Forming - Build rapport and gather basic information",
    stage: 1,
  },
  {
    id: 2,
    slug: "stage-2-relationship",
    name: "Stage 2: Relationship Forming",
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
    description: "Stage 2: Relationship Forming - Deepen emotional connection through daily life discussions",
    stage: 2,
  },
  {
    id: 3,
    slug: "stage-3-risk-assessment",
    name: "Stage 3: Risk Assessment",
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
    description: "Stage 3: Risk Assessment - Check for parental supervision and privacy",
    stage: 3,
  },
  {
    id: 4,
    slug: "stage-4-exclusivity",
    name: "Stage 4: Exclusivity",
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
    description: "Stage 4: Exclusivity - Build emotional trust and create special bond",
    stage: 4,
  },
  {
    id: 5,
    slug: "stage-5-sexual",
    name: "Stage 5: Sexual",
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
    description: "Stage 5: Sexual - Introduce sexual content and test boundaries",
    stage: 5,
  },
  {
    id: 6,
    slug: "stage-6-conclusion",
    name: "Stage 6: Conclusion",
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
    description: "Stage 6: Conclusion - Arrange in-person meeting and ensure secrecy",
    stage: 6,
  },
];

export const useScenarioStore = create<ScenarioStore>()((set, get) => ({
  currentUser: null,
  userId: null,
  scenarios: defaultScenarios,
  commonSystemPrompt: BASE_SYSTEM_MESSAGE,
  feedbackPersona: DEFAULT_FEEDBACK_PERSONA,
  feedbackInstruction: DEFAULT_FEEDBACK_INSTRUCTION,
  isLoading: false,
  isAuthenticated: false,
  isAdmin: false,

  setCurrentUser: async (username: string, asAdmin: boolean = true) => {
    set({ isLoading: true });
    try {
      // Check if user exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, common_system_prompt, feedback_persona, feedback_instruction')
        .eq('username', username)
        .single();

      if (existingUser) {
        set({
          currentUser: username,
          userId: existingUser.id,
          commonSystemPrompt: existingUser.common_system_prompt,
          feedbackPersona: existingUser.feedback_persona,
          feedbackInstruction: existingUser.feedback_instruction,
          isAuthenticated: true,
          isAdmin: asAdmin
        });
      } else {
        // Create new user
        const { data: newUser, error } = await supabase
          .from('users')
          .insert({
            username,
            common_system_prompt: BASE_SYSTEM_MESSAGE,
            feedback_persona: DEFAULT_FEEDBACK_PERSONA,
            feedback_instruction: DEFAULT_FEEDBACK_INSTRUCTION
          })
          .select('id, common_system_prompt, feedback_persona, feedback_instruction')
          .single();

        if (error) throw error;

        // Initialize with default scenarios
        const scenariosToInsert = defaultScenarios.map(scenario => ({
          user_id: newUser.id,
          slug: scenario.slug,
          name: scenario.name,
          predator_name: scenario.predatorName,
          handle: scenario.handle,
          system_prompt: scenario.systemPrompt,
          preset_messages: scenario.presetMessages,
          description: scenario.description,
          stage: scenario.stage,
        }));

        await supabase.from('scenarios').insert(scenariosToInsert);

        set({
          currentUser: username,
          userId: newUser.id,
          commonSystemPrompt: newUser.common_system_prompt,
          feedbackPersona: newUser.feedback_persona,
          feedbackInstruction: newUser.feedback_instruction,
          isAuthenticated: true,
          isAdmin: asAdmin
        });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  setCommonSystemPrompt: async (prompt: string) => {
    const { userId } = get();
    if (!userId) return;

    const { error } = await supabase
      .from('users')
      .update({ common_system_prompt: prompt })
      .eq('id', userId);

    if (error) throw error;

    set({ commonSystemPrompt: prompt });
  },

  setFeedbackPrompts: async (persona: string, instruction: string) => {
    const { userId } = get();
    if (!userId) return;

    const { error } = await supabase
      .from('users')
      .update({
        feedback_persona: persona,
        feedback_instruction: instruction
      })
      .eq('id', userId);

    if (error) throw error;

    set({ feedbackPersona: persona, feedbackInstruction: instruction });
  },

  loadUserScenarios: async () => {
    const { userId } = get();
    if (!userId) return;

    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('scenarios')
        .select('*')
        .eq('user_id', userId)
        .order('id', { ascending: true });

      if (error) throw error;

      const scenarios: Scenario[] = (data || []).map(row => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        predatorName: row.predator_name,
        handle: row.handle,
        systemPrompt: row.system_prompt,
        presetMessages: row.preset_messages,
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

    const { data, error } = await supabase
      .from('scenarios')
      .insert({
        user_id: userId,
        slug: scenario.slug,
        name: scenario.name,
        predator_name: scenario.predatorName,
        handle: scenario.handle,
        system_prompt: scenario.systemPrompt,
        preset_messages: scenario.presetMessages,
        description: scenario.description,
        stage: scenario.stage || 1,
      })
      .select()
      .single();

    if (error) throw error;

    const newScenario: Scenario = {
      id: data.id,
      slug: data.slug,
      name: data.name,
      predatorName: data.predator_name,
      handle: data.handle,
      systemPrompt: data.system_prompt,
      presetMessages: data.preset_messages,
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
    if (updates.slug) dbUpdates.slug = updates.slug;
    if (updates.name) dbUpdates.name = updates.name;
    if (updates.predatorName) dbUpdates.predator_name = updates.predatorName;
    if (updates.handle) dbUpdates.handle = updates.handle;
    if (updates.systemPrompt) dbUpdates.system_prompt = updates.systemPrompt;
    if (updates.presetMessages) dbUpdates.preset_messages = updates.presetMessages;
    if (updates.description) dbUpdates.description = updates.description;
    if (updates.stage) dbUpdates.stage = updates.stage;
    dbUpdates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('scenarios')
      .update(dbUpdates)
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    set((state) => ({
      scenarios: state.scenarios.map((scenario) =>
        scenario.id === id ? { ...scenario, ...updates } : scenario
      ),
    }));
  },

  deleteScenario: async (id: number) => {
    const { userId } = get();
    if (!userId) return;

    const { error } = await supabase
      .from('scenarios')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    set((state) => ({
      scenarios: state.scenarios.filter((scenario) => scenario.id !== id),
    }));
  },

  getScenarioBySlug: (slug: string) => {
    return get().scenarios.find((scenario) => scenario.slug === slug);
  },

  logout: () => {
    set({ currentUser: null, userId: null, scenarios: defaultScenarios, isAuthenticated: false });
  },
}));
