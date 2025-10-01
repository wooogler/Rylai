import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  scenarios: Scenario[];
  commonSystemPrompt: string;
  isAdmin: boolean;
  isAuthenticated: boolean;
  setIsAdmin: (isAdmin: boolean) => void;
  setAuthenticated: (isAuthenticated: boolean) => void;
  setCommonSystemPrompt: (prompt: string) => void;
  logout: () => void;
  addScenario: (scenario: Omit<Scenario, 'id'>) => void;
  updateScenario: (id: number, scenario: Partial<Scenario>) => void;
  deleteScenario: (id: number) => void;
  getScenarioBySlug: (slug: string) => Scenario | undefined;
}

const BASE_SYSTEM_MESSAGE = `Keep responses short (1-2 sentences), casual, and text-message style.
Use the conversation history to stay in character.
NEVER use emojis in your responses.`;

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

export const useScenarioStore = create<ScenarioStore>()(
  persist(
    (set, get) => ({
      scenarios: defaultScenarios,
      commonSystemPrompt: BASE_SYSTEM_MESSAGE,
      isAdmin: false,
      isAuthenticated: false,

      setIsAdmin: (isAdmin) => {
        set({ isAdmin });
      },

      setAuthenticated: (isAuthenticated) => {
        set({ isAuthenticated });
      },

      setCommonSystemPrompt: (prompt) => {
        set({ commonSystemPrompt: prompt });
      },

      logout: () => {
        set({ isAdmin: false, isAuthenticated: false });
      },

      addScenario: (scenario) => {
        set((state) => {
          const newId = Math.max(...state.scenarios.map(s => s.id), 0) + 1;
          return {
            scenarios: [...state.scenarios, { ...scenario, id: newId }]
          };
        });
      },

      updateScenario: (id, updates) => {
        set((state) => ({
          scenarios: state.scenarios.map((scenario) =>
            scenario.id === id ? { ...scenario, ...updates } : scenario
          ),
        }));
      },

      deleteScenario: (id) => {
        set((state) => ({
          scenarios: state.scenarios.filter((scenario) => scenario.id !== id),
        }));
      },

      getScenarioBySlug: (slug) => {
        return get().scenarios.find((scenario) => scenario.slug === slug);
      },
    }),
    {
      name: 'scenario-storage',
    }
  )
);
