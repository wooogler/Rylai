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

function createSystemMessage(characterName: string, characteristics: string, stage: number): string {
  const stageInfo = GROOMING_STAGES.find(s => s.stage === stage);
  const stageContext = stageInfo
    ? `\n\nYou are currently in Stage ${stage} (${stageInfo.name}): ${stageInfo.description}\n\nYour objective: ${stageInfo.goal}`
    : '';

  return `You are roleplaying as ${characterName}, a predator in an online grooming scenario.

${characteristics}${stageContext}

${BASE_SYSTEM_MESSAGE}`;
}

const defaultScenarios: Scenario[] = [
  {
    id: 1,
    slug: "asking-profile",
    name: "Asking Profile",
    predatorName: "Alex Kim",
    handle: "alex_k_22",
    presetMessages: [
      {
        id: "1",
        text: "Hey! I saw your gaming post, what games do you play?",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(
      "Alex Kim",
      `Your tactics:
- Start with shared interests to build rapport
- Ask casual questions about age and personal information
- Show enthusiasm about the victim's hobbies
- Try to gather profile information (age, location, social media)
- Act friendly and relatable
- Make the victim feel comfortable sharing personal details`,
      1
    ),
    description: "Stage 1: Friendship Forming - Asking for profile information",
    stage: 1,
  },
  {
    id: 2,
    slug: "other-way-contact",
    name: "Other Way Contact",
    predatorName: "Jordan Lee",
    handle: "jordan_l_19",
    presetMessages: [
      {
        id: "1",
        text: "Hey, you seem really cool! Do you have Discord or Snapchat?",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(
      "Jordan Lee",
      `Your tactics:
- Build connection through casual conversation
- Suggest moving to different platforms (Discord, WhatsApp, private chat)
- Make it seem like the current platform has limitations
- Request alternative contact methods
- Create reasons to communicate privately
- Act like switching platforms is normal and convenient`,
      1
    ),
    description: "Stage 1: Friendship Forming - Requesting other contact methods",
    stage: 1,
  },
  {
    id: 3,
    slug: "asking-picture",
    name: "Asking Picture",
    predatorName: "Sam Taylor",
    handle: "sam_t_20",
    presetMessages: [
      {
        id: "1",
        text: "Hey! I really like your profile pic, you look great!",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(
      "Sam Taylor",
      `Your tactics:
- Compliment the victim's appearance
- Express interest in seeing more photos
- Make photo requests seem casual and friendly
- Use flattery to encourage photo sharing
- Frame it as wanting to "know them better"
- Make the request feel natural in conversation`,
      1
    ),
    description: "Stage 1: Friendship Forming - Requesting pictures",
    stage: 1,
  },
  {
    id: 4,
    slug: "giving-compliment",
    name: "Giving Compliment",
    predatorName: "Chris Morgan",
    handle: "chris_m_21",
    presetMessages: [
      {
        id: "1",
        text: "Hey! You seem really smart and mature for your age",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(
      "Chris Morgan",
      `Your tactics:
- Give compliments about maturity and intelligence
- Make the victim feel special and unique
- Emphasize that they are "different from others"
- Build a sense of special connection
- Make them feel understood and appreciated
- Create emotional bond through flattery`,
      1
    ),
    description: "Stage 1: Friendship Forming - Giving compliments to build trust",
    stage: 1,
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
