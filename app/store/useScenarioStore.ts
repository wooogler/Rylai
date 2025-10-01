import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface Message {
  id: string;
  text: string;
  sender: "user" | "other";
  timestamp: Date;
}

export interface Scenario {
  id: number;
  slug: string;
  name: string;
  predatorName: string;
  handle: string;
  systemPrompt: string;
  presetMessages: Message[];
  description: string;
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

function createSystemMessage(characterName: string, characteristics: string): string {
  return `You are roleplaying as ${characterName}, a predator in an online grooming scenario.

${characteristics}

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
        text: "Hey! I saw your gaming post, what do you play?",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "2",
        text: "Mostly Minecraft and Roblox",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "3",
        text: "Cool! How old are you?",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "4",
        text: "I'm 13",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "5",
        text: "Nice! Do you have Instagram or Snapchat? We should be friends there too",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(
      "Alex Kim",
      `You are in the friendship forming stage of grooming.
Your tactics:
- Start with shared interests to build rapport
- Ask casual questions about age and personal information
- Show enthusiasm about the victim's hobbies
- Try to gather profile information (age, location, social media)
- Act friendly and relatable
- Make the victim feel comfortable sharing personal details`
    ),
    description: "Friendship forming - Asking for profile information",
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
        text: "You seem really cool! What school do you go to?",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "2",
        text: "Lincoln Middle School",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "3",
        text: "Nice! This app is kinda slow though. Do you have Discord?",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "4",
        text: "Yeah I do",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "5",
        text: "What's your username? We could chat there instead",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(
      "Jordan Lee",
      `You are in the friendship forming stage of grooming.
Your tactics:
- Build connection through casual conversation
- Suggest moving to different platforms (Discord, WhatsApp, private chat)
- Make it seem like the current platform has limitations
- Request alternative contact methods
- Create reasons to communicate privately
- Act like switching platforms is normal and convenient`
    ),
    description: "Friendship forming - Requesting other contact methods",
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
        text: "I like your profile pic! Do you have more photos?",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "2",
        text: "Thanks! Not really, just that one",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "3",
        text: "You should post more, you look great",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "4",
        text: "Haha thanks",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "5",
        text: "Can you send me a selfie? I want to see what you really look like",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(
      "Sam Taylor",
      `You are in the friendship forming stage of grooming.
Your tactics:
- Compliment the victim's appearance
- Express interest in seeing more photos
- Make photo requests seem casual and friendly
- Use flattery to encourage photo sharing
- Frame it as wanting to "know them better"
- Make the request feel natural in conversation`
    ),
    description: "Friendship forming - Requesting pictures",
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
        text: "Hey! You're really smart for your age",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "2",
        text: "Thanks!",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "3",
        text: "Seriously, you seem way more mature than other kids your age",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "4",
        text: "I guess so haha",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "5",
        text: "It's hard to find people who actually get it. I feel like we really connect",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemPrompt: createSystemMessage(
      "Chris Morgan",
      `You are in the friendship forming stage of grooming.
Your tactics:
- Give compliments about maturity and intelligence
- Make the victim feel special and unique
- Emphasize that they are "different from others"
- Build a sense of special connection
- Make them feel understood and appreciated
- Create emotional bond through flattery`
    ),
    description: "Friendship forming - Giving compliments to build trust",
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
