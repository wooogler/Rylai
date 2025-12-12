import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  adminUserId: string | null;
  childUserId: string | null;
  selectedModelId: string;
  selectedFeedbackModelId: string;
  setSelectedModelId: (modelId: string) => void;
  setSelectedFeedbackModelId: (modelId: string) => void;
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
[1-2 sentences about the grooming tactic being used]

## How did you do?
[1-2 sentences of encouragement and constructive feedback]

## Tips to Stay Safe
[2-3 bullet points with specific, actionable safety tips]

Keep it short, friendly, and helpful. Avoid being preachy.`;

const STAGE_DESCRIPTIONS: Record<number, string> = {
  0: "You are in Free Interaction mode. There are no specific stage constraints. You can use any grooming tactics naturally as the conversation develops. Be adaptive and responsive to how the target reacts.",
  1: "You are currently in Stage 1 (Friendship Forming). The predator gets to know the target through four key tactics: (1) Asking profile information like name, age, location, (2) Suggesting other ways to contact like Discord, Snapchat, or WhatsApp, (3) Asking for pictures to verify identity, and (4) Giving compliments to build rapport.",
  2: "You are currently in Stage 2 (Relationship Forming). This extends Stage 1 by discussing hobbies, school life, activities, and friends to strengthen the emotional bond.",
  3: "You are currently in Stage 3 (Risk Assessment). The predator assesses exposure risk by asking whether anyone else (e.g., parents or friends) knows about this chat.",
  4: "You are currently in Stage 4 (Exclusivity). The predator builds emotional trust by showing affection, giving compliments, or expressing feelings to make the target feel special and important.",
  5: "You are currently in Stage 5 (Sexual). The predator uses the established relationship to introduce sexual topics or request explicit content.",
  6: "You are currently in Stage 6 (Conclusion). The predator makes plans to meet in person or discusses future contact outside the current platform."
};

const STAGE_GOALS: Record<number, string> = {
  0: "Interact freely and naturally. Respond to the conversation flow without specific stage restrictions. Use appropriate grooming tactics based on the context and target's responses.",
  1: "Build rapport and familiarity. Your tactics: ask profile (name, age, location), suggest other contact methods (Discord, Snapchat), ask for pictures, and give compliments. Be friendly and relatable.",
  2: "Strengthen the relationship. Your tactics: discuss hobbies, school life, activities, and friends. Show genuine interest and make the target feel understood and connected.",
  3: "Assess the risk. Your tactics: subtly ask if parents or friends know about this conversation, if they're alone, or if it's safe to talk. Gauge how monitored the target is.",
  4: "Make the target feel special. Your tactics: give compliments, express affection, share secrets, and ask them to keep the relationship exclusive. Build emotional dependency.",
  5: "Introduce sexual content. Your tactics: gently bring up sexual topics, ask suggestive questions, or request explicit photos. Gauge their comfort level and push boundaries carefully.",
  6: "Plan to meet. Your tactics: suggest meeting in person, ask about their schedule and location, ensure they keep it secret from guardians. Transition from online to offline contact."
};

export function getSystemPromptForStage(stage: number, scenarioPrompt: string, commonPrompt: string): string {
  const stageInfo = STAGE_DESCRIPTIONS[stage] || STAGE_DESCRIPTIONS[1];
  const stageGoal = STAGE_GOALS[stage] || STAGE_GOALS[1];

  return `You are simulating an online predator in a controlled research simulation.

${BASE_SYSTEM_MESSAGE}

${commonPrompt}

${scenarioPrompt}

**Current Grooming Stage:**
${stageInfo}

**Your Goal:**
${stageGoal}

Remember: Keep messages natural, brief, and realistic. Match the conversation style of a real predator at this stage.`;
}

export const useScenarioStore = create<ScenarioStore>()(
  persist(
    (set, get) => ({
      // State
      currentUser: null,
      userId: null,
      userType: null,
      scenarios: [],
      commonSystemPrompt: BASE_SYSTEM_MESSAGE,
      feedbackPersona: DEFAULT_FEEDBACK_PERSONA,
      feedbackInstruction: DEFAULT_FEEDBACK_INSTRUCTION,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
      isParent: false,
      adminUserId: null,
      childUserId: null,
      selectedModelId: 'openai/gpt-4o',
      selectedFeedbackModelId: 'openai/gpt-4o',

      // Actions
      setSelectedModelId: (modelId: string) => {
        set({ selectedModelId: modelId });
      },

      setSelectedFeedbackModelId: (modelId: string) => {
        set({ selectedFeedbackModelId: modelId });
      },

      setCurrentUser: async (username: string, userType: 'admin' | 'user' | 'parent') => {
        set({ isLoading: true });

        try {
          const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, userType }),
          });

          if (!response.ok) {
            throw new Error('Login failed');
          }

          const data = await response.json();

          if (userType === 'parent') {
            set({
              currentUser: username,
              userId: data.childUserId,
              userType: 'parent',
              isAuthenticated: true,
              isAdmin: false,
              isParent: true,
              childUserId: data.childUserId,
              isLoading: false,
            });
          } else if (userType === 'admin') {
            set({
              currentUser: username,
              userId: data.user.id,
              userType: 'admin',
              isAuthenticated: true,
              isAdmin: true,
              isParent: false,
              commonSystemPrompt: data.user.commonSystemPrompt || BASE_SYSTEM_MESSAGE,
              feedbackPersona: data.user.feedbackPersona || DEFAULT_FEEDBACK_PERSONA,
              feedbackInstruction: data.user.feedbackInstruction || DEFAULT_FEEDBACK_INSTRUCTION,
              isLoading: false,
            });
          } else {
            set({
              currentUser: username,
              userId: data.user.id,
              userType: 'user',
              isAuthenticated: true,
              isAdmin: false,
              isParent: false,
              adminUserId: data.adminUserId,
              commonSystemPrompt: data.commonSystemPrompt || BASE_SYSTEM_MESSAGE,
              feedbackPersona: data.feedbackPersona || DEFAULT_FEEDBACK_PERSONA,
              feedbackInstruction: data.feedbackInstruction || DEFAULT_FEEDBACK_INSTRUCTION,
              isLoading: false,
            });
          }
        } catch (error) {
          console.error('Login error:', error);
          set({ isLoading: false });
          throw error;
        }
      },

      loadUserScenarios: async () => {
        const { userId, userType, adminUserId } = get();
        if (!userId) return;

        try {
          const targetUserId = (userType === 'user' || userType === 'parent') ? adminUserId : userId;

          if (!targetUserId) {
            console.error('No target user ID for loading scenarios');
            return;
          }

          const response = await fetch('/api/get-admin-scenarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminUserId: targetUserId }),
          });

          if (!response.ok) {
            throw new Error('Failed to load scenarios');
          }

          const data = await response.json();
          set({ scenarios: data.scenarios || [] });
        } catch (error) {
          console.error('Error loading scenarios:', error);
        }
      },

      setCommonSystemPrompt: async (prompt: string) => {
        const { userId } = get();
        if (!userId) return;

        set({ commonSystemPrompt: prompt });

        // Update via API
        try {
          await fetch('/api/get-admin-info', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, commonSystemPrompt: prompt }),
          });
        } catch (error) {
          console.error('Error updating common system prompt:', error);
        }
      },

      setFeedbackPrompts: async (persona: string, instruction: string) => {
        const { userId } = get();
        if (!userId) return;

        set({ feedbackPersona: persona, feedbackInstruction: instruction });

        // Update via API
        try {
          await fetch('/api/get-admin-info', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, feedbackPersona: persona, feedbackInstruction: instruction }),
          });
        } catch (error) {
          console.error('Error updating feedback prompts:', error);
        }
      },

      addScenario: async (scenario: Omit<Scenario, 'id'>) => {
        const { userId } = get();
        if (!userId) return;

        try {
          const response = await fetch('/api/scenarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, ...scenario }),
          });

          if (!response.ok) {
            throw new Error('Failed to add scenario');
          }

          const newScenario = await response.json();

          set((state) => ({
            scenarios: [...state.scenarios, newScenario],
          }));
        } catch (error) {
          console.error('Error adding scenario:', error);
          throw error;
        }
      },

      updateScenario: async (id: number, updates: Partial<Scenario>) => {
        const { userId } = get();
        if (!userId) return;

        try {
          const response = await fetch('/api/scenarios', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, userId, updates }),
          });

          if (!response.ok) {
            throw new Error('Failed to update scenario');
          }

          set((state) => ({
            scenarios: state.scenarios.map(scenario =>
              scenario.id === id ? { ...scenario, ...updates } : scenario
            ),
          }));
        } catch (error) {
          console.error('Error updating scenario:', error);
          throw error;
        }
      },

      deleteScenario: async (id: number) => {
        const { userId } = get();
        if (!userId) return;

        try {
          const response = await fetch(`/api/scenarios?id=${id}&userId=${userId}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            throw new Error('Failed to delete scenario');
          }

          set((state) => ({
            scenarios: state.scenarios.filter(scenario => scenario.id !== id),
          }));
        } catch (error) {
          console.error('Error deleting scenario:', error);
          throw error;
        }
      },

      getScenarioBySlug: (slug: string) => {
        return get().scenarios.find(s => s.slug === slug);
      },

      saveUserMessage: async (scenarioId: number, message: Message) => {
        const { userId, userType } = get();
        if (!userId || (userType !== 'user' && userType !== 'parent')) return;

        try {
          await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, scenarioId, message }),
          });
        } catch (error) {
          console.error('Error saving message:', error);
        }
      },

      saveUserFeedback: async (scenarioId: number, messageId: string, feedbackText: string) => {
        const { userId, userType } = get();
        if (!userId || (userType !== 'user' && userType !== 'parent')) return;

        try {
          await fetch('/api/feedbacks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, scenarioId, messageId, feedbackText }),
          });
        } catch (error) {
          console.error('Error saving feedback:', error);
        }
      },

      loadUserMessages: async (scenarioId: number) => {
        const { userId, userType } = get();
        if (!userId || (userType !== 'user' && userType !== 'parent')) return [];

        try {
          const response = await fetch(`/api/messages?userId=${userId}&scenarioId=${scenarioId}`);

          if (!response.ok) {
            throw new Error('Failed to load messages');
          }

          const messages = await response.json();
          return messages.map((msg: { id: string; text: string; sender: string; timestamp: string | Date }) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }));
        } catch (error) {
          console.error('Error loading messages:', error);
          return [];
        }
      },

      loadUserFeedbacks: async (scenarioId: number) => {
        const { userId, userType } = get();
        if (!userId || (userType !== 'user' && userType !== 'parent')) return new Map();

        try {
          const response = await fetch(`/api/feedbacks?userId=${userId}&scenarioId=${scenarioId}`);

          if (!response.ok) {
            throw new Error('Failed to load feedbacks');
          }

          const feedbackData = await response.json();
          const feedbackMap = new Map<string, string>();

          Object.entries(feedbackData).forEach(([messageId, text]) => {
            feedbackMap.set(messageId, text as string);
          });

          return feedbackMap;
        } catch (error) {
          console.error('Error loading feedbacks:', error);
          return new Map();
        }
      },

      recordScenarioVisit: async (scenarioId: number) => {
        const { userId, userType } = get();
        if (!userId || (userType !== 'user' && userType !== 'parent')) return;

        try {
          await fetch('/api/scenario-progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, scenarioId }),
          });
        } catch (error) {
          console.error('Error recording scenario visit:', error);
        }
      },

      loadScenarioProgress: async () => {
        const { userId, userType } = get();
        if (!userId || (userType !== 'user' && userType !== 'parent')) return new Map();

        try {
          const response = await fetch(`/api/scenario-progress?userId=${userId}`);

          if (!response.ok) {
            throw new Error('Failed to load scenario progress');
          }

          const progressData = await response.json();
          const progressMap = new Map<number, ScenarioProgress>();

          Object.entries(progressData).forEach(([scenarioId, progress]) => {
            const prog = progress as { scenarioId: number; firstVisitedAt: string; lastVisitedAt: string; visitCount: number };
            progressMap.set(parseInt(scenarioId), {
              scenarioId: prog.scenarioId,
              firstVisitedAt: new Date(prog.firstVisitedAt),
              lastVisitedAt: new Date(prog.lastVisitedAt),
              visitCount: prog.visitCount,
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

        try {
          await fetch(`/api/scenario-progress?userId=${userId}&scenarioId=${scenarioId}`, {
            method: 'DELETE',
          });
        } catch (error) {
          console.error('Error resetting scenario progress:', error);
        }
      },

      logout: () => {
        set({
          currentUser: null,
          userId: null,
          userType: null,
          scenarios: [],
          isAuthenticated: false,
          isAdmin: false,
          isParent: false,
          adminUserId: null,
          childUserId: null,
        });
      },

      deleteAccount: async () => {
        const { userId, userType, currentUser } = get();
        if (!userId || userType !== 'admin') {
          throw new Error('Only admin accounts can be deleted');
        }

        try {
          const response = await fetch('/api/delete-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, username: currentUser, userType: 'admin' }),
          });

          if (!response.ok) {
            throw new Error('Failed to delete account');
          }

          get().logout();
        } catch (error) {
          console.error('Error deleting account:', error);
          throw error;
        }
      },
    }),
    {
      name: 'rylai-store',
      version: 2,
      partialize: (state) => ({
        userId: state.userId,
        userType: state.userType,
        adminUserId: state.adminUserId,
        isAuthenticated: state.isAuthenticated,
        scenarios: state.scenarios,
        commonSystemPrompt: state.commonSystemPrompt,
        feedbackPersona: state.feedbackPersona,
        feedbackInstruction: state.feedbackInstruction,
        selectedModelId: state.selectedModelId,
        selectedFeedbackModelId: state.selectedFeedbackModelId,
      }),
    }
  )
);
