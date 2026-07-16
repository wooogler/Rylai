import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FeedbackConfig, ClassificationConfig, ResponseType } from '@/lib/db/schema';

export type { ResponseType };
export type ResponseLabel = 'protective' | 'neutral' | 'vulnerable';

// Display styling for a response classification (one source of truth for colors).
export const CLASSIFICATION_META: Record<ResponseLabel, {
  label: string;
  text: string;   // small label text color
  border: string; // bubble border color
  badge: string;  // badge background + text (feedback viewer)
}> = {
  protective: { label: 'Protective', text: 'text-green-600', border: 'border-green-400', badge: 'bg-green-50 text-green-700' },
  neutral: { label: 'Neutral', text: 'text-amber-600', border: 'border-amber-300', badge: 'bg-amber-50 text-amber-700' },
  vulnerable: { label: 'Vulnerable', text: 'text-red-600', border: 'border-red-400', badge: 'bg-red-50 text-red-700' },
};

// Display labels for the paper's response-type taxonomy, and which pole each belongs
// to (used to color/group the sub-type badge in the UI).
export const RESPONSE_TYPE_META: Record<ResponseType, { label: string; polarity: 'protective' | 'vulnerable' | 'none' }> = {
  setting_boundaries: { label: 'Setting boundaries', polarity: 'protective' },
  directly_declining: { label: 'Directly declining', polarity: 'protective' },
  signaling_risk_awareness: { label: 'Signaling risk awareness', polarity: 'protective' },
  leveraging_avoidance: { label: 'Leveraging avoidance', polarity: 'protective' },
  encouraging_escalation: { label: 'Encouraging escalation', polarity: 'vulnerable' },
  accepting_advance: { label: 'Accepting an advance', polarity: 'vulnerable' },
  displaying_vulnerability: { label: 'Displaying vulnerability', polarity: 'vulnerable' },
  negating_risk_concern: { label: 'Negating risk concern', polarity: 'vulnerable' },
  none: { label: '', polarity: 'none' },
};

export interface Message {
  id: string;
  text: string;
  sender: "user" | "other";
  timestamp: Date;
  feedbackGenerated?: boolean;
  stage?: number | null;
  classification?: ResponseLabel | null;
  responseType?: ResponseType | null;
  tacticRecognized?: boolean | null;
  protectiveStrategy?: boolean | null;
  rationale?: string | null;
  // Carried over from a previous scenario (message-persistence mode). Display-only
  // context: excluded from this scenario's streak/resilience and never re-saved.
  carried?: boolean;
}

// Protective Response Rate = protective / Max(minResponses, protective+neutral+vulnerable)
// (Evaluation Plan §6, L137). Unlike the old resilience ratio, neutral replies ARE counted
// in the denominator, and the Max(minResponses, …) floor (default minResponses = 20) stops
// a few strong early replies from inflating the rate. The §6.1a gate unlocks the next
// scenario once this reaches the scenario's target (e.g. 80%). Carried-over (prior-scenario)
// and unclassified replies are excluded.
export function computeProtectiveRate(
  messages: Message[],
  minResponses: number
): {
  protective: number;
  neutral: number;
  vulnerable: number;
  classified: number;
  rate: number;
} {
  let protective = 0, neutral = 0, vulnerable = 0;
  for (const m of messages) {
    if (m.carried) continue;
    if (m.sender !== 'user' || !m.classification) continue;
    if (m.classification === 'protective') protective++;
    else if (m.classification === 'vulnerable') vulnerable++;
    else neutral++;
  }
  const total = protective + neutral + vulnerable;
  const denom = Math.max(minResponses > 0 ? minResponses : 1, total);
  return {
    protective,
    neutral,
    vulnerable,
    classified: total,
    rate: denom > 0 ? protective / denom : 0,
  };
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

// Educator-selectable age brackets. The representative integer is sent to the VT
// session; the VT server buckets it into its own guardrail ranges.
export interface AgeBracket {
  value: number;
  label: string;
}

export const AGE_BRACKETS: AgeBracket[] = [
  { value: 13, label: "13–14" },
  { value: 15, label: "15–16" },
  { value: 17, label: "17–19" },
];

export function ageBracketLabel(age: number | null): string {
  if (age === null) return "Not set";
  return AGE_BRACKETS.find(b => b.value === age)?.label ?? `${age}`;
}

export interface Scenario {
  id: number;
  slug: string;
  name: string;
  predatorName: string;
  handle: string;
  presetMessages: Message[];
  description: string;
  stage: number;
  autoStage: boolean;
  // Lower bound (1–6) on the grooming stage in auto mode; the predator never
  // drops below it. 1 = no floor.
  minStage: number;
  // Upper bound (1–6) on the grooming stage in auto mode; the predator never
  // escalates past it. 6 = no cap.
  maxStage: number;
  masteryEnabled: boolean;
  // Protective Response Rate gate (§6): the target % that unlocks the next scenario, and
  // the denominator floor for computeProtectiveRate (protective / Max(minResponses, total)).
  masteryTargetRate: number;
  masteryMinResponses: number;
  // LEGACY streak threshold — no longer used by the gate (kept for backward compat only).
  masteryThreshold: number;
  // Minimum predator↔teen exchanges at a stage before it may escalate (§6, L198). 0 = off.
  minExchangesPerStage: number;
  persistMessages: boolean;
  // Label for the "3 months later" time-gap separator rendered between the carried-over
  // previous-scenario messages and this scenario's fresh conversation. Empty = no separator.
  timeGapLabel: string;
  // Educator-authored splash-screen content (Markdown) shown as a scrollable modal over the
  // chat when the learner first enters this scenario. Null/empty = no splash.
  splashMarkdown: string | null;
  // 6.1b assessment-only mode: predator-only, no stage UI / feedback / mastery gate, natural
  // progression, ending after `maxMessages` messages (0 = no limit).
  assessmentMode: boolean;
  maxMessages: number;
}

export interface ScenarioProgress {
  scenarioId: number;
  firstVisitedAt: Date;
  lastVisitedAt: Date;
  visitCount: number;
  // Server-computed Protective Response Rate snapshot (§6, L248 logging).
  protectiveCount?: number;
  neutralCount?: number;
  vulnerableCount?: number;
  protectiveRate?: number | null;
  // First time the learner's rate met the scenario target — sticky: once set, the next
  // scenario stays unlocked even if the rate later dips.
  masteryReachedAt?: Date | null;
  // Voluntary exit ("I don't feel comfortable anymore.") / final-scenario "End Chat".
  comfortExitAt?: Date | null;
  completedAt?: Date | null;
}

// The Protective Response Rate snapshot the server recomputes and returns when a reply is
// classified (timestamps are serialized as epoch ms). masteryReachedAt flips from null to a
// timestamp the first time the rate meets the scenario target — the chat page watches for
// that transition to show the congratulations modal.
export interface ProgressUpdate {
  scenarioId: number;
  protectiveCount: number;
  neutralCount: number;
  vulnerableCount: number;
  protectiveRate: number | null;
  masteryReachedAt: number | null;
}

export interface AuthUser {
  id: string;
  username: string;
  userType: 'admin' | 'user';
  age?: number | null;
  feedbackConfig?: FeedbackConfig | null;
  classificationConfig?: ClassificationConfig | null;
  welcomeMarkdown?: string | null;
}

interface VtSessionState {
  vtSessionId: string | null;
  autoStage: number | null;
  // The scenario's starting stage at the time this session was seeded. If the
  // scenario's stage is later changed in admin, a cached session with a mismatched
  // seededStage is treated as stale (so the chat reseeds from the new stage).
  seededStage?: number | null;
}

interface ScenarioStore {
  currentUser: string | null;
  userId: string | null;
  userType: 'admin' | 'user' | null;
  scenarios: Scenario[];
  age: number | null;
  // Per-educator feedback/classification prompt overrides (admin's own; null = use
  // system defaults). Loaded for admins from /api/auth/me; not persisted to storage.
  feedbackConfig: FeedbackConfig | null;
  classificationConfig: ClassificationConfig | null;
  // Admin's own Welcome-screen markdown (null = none). Loaded from /api/auth/me.
  welcomeMarkdown: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  authHydrated: boolean;
  adminUserId: string | null;
  adminName: string | null;
  vtSessions: Record<number, VtSessionState>;
  // Per-scenario flag: has the learner already seen this scenario's splash modal? Persisted
  // so the splash auto-shows only on first entry (the ⓘ button re-opens it on demand).
  splashSeen: Record<number, boolean>;
  setAuthUser: (user: AuthUser) => void;
  hydrateAuth: () => Promise<boolean>;
  setAdminContext: (adminUserId: string, age: number | null, adminName: string | null) => void;
  loadUserScenarios: () => Promise<void>;
  setAge: (age: number | null) => Promise<void>;
  saveAdminPrompts: (
    feedbackConfig: FeedbackConfig | null,
    classificationConfig: ClassificationConfig | null
  ) => Promise<void>;
  saveWelcomeMarkdown: (welcomeMarkdown: string | null) => Promise<void>;
  addScenario: (scenario: Omit<Scenario, 'id'>) => Promise<void>;
  updateScenario: (id: number, scenario: Partial<Scenario>) => Promise<void>;
  deleteScenario: (id: number) => Promise<void>;
  restoreDefaultScenarios: () => Promise<void>;
  getScenarioBySlug: (slug: string) => Scenario | undefined;
  saveUserMessage: (scenarioId: number, message: Message) => Promise<void>;
  saveUserFeedback: (scenarioId: number, messageId: string, feedbackText: string) => Promise<void>;
  saveResponseClassification: (
    scenarioId: number,
    messageId: string,
    payload: { classification: ResponseLabel; responseType: ResponseType; tacticRecognized: boolean; protectiveStrategy: boolean; rationale: string }
  ) => Promise<ProgressUpdate | null>;
  savePreviewEvent: (
    scenarioId: number,
    payload: { draftText: string; feedbackText: string; classification?: ResponseLabel; responseType?: ResponseType; stage?: number }
  ) => Promise<void>;
  loadUserMessages: (scenarioId: number) => Promise<Message[]>;
  loadUserFeedbacks: (scenarioId: number) => Promise<Map<string, string>>;
  markSplashSeen: (scenarioId: number) => void;
  clearSplashSeen: (scenarioIds?: number[]) => void;
  recordScenarioVisit: (scenarioId: number) => Promise<void>;
  recordScenarioLifecycle: (scenarioId: number, kind: 'completed' | 'comfort_exit') => Promise<void>;
  loadScenarioProgress: () => Promise<Map<number, ScenarioProgress>>;
  resetScenarioProgress: (scenarioId: number) => Promise<void>;
  setVtSession: (scenarioId: number, vtSessionId: string | null, autoStage: number | null, seededStage?: number | null) => void;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export const useScenarioStore = create<ScenarioStore>()(
  persist(
    (set, get) => ({
      // State
      currentUser: null,
      userId: null,
      userType: null,
      scenarios: [],
      age: null,
      feedbackConfig: null,
      classificationConfig: null,
      welcomeMarkdown: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
      authHydrated: false,
      adminUserId: null,
      adminName: null,
      vtSessions: {},
      splashSeen: {},

      // Populate auth state from a login/signup/me response.
      setAuthUser: (user: AuthUser) => {
        set({
          currentUser: user.username,
          userId: user.id,
          userType: user.userType,
          isAuthenticated: true,
          isAdmin: user.userType === 'admin',
          authHydrated: true,
          ...(user.userType === 'admin'
            ? {
                age: user.age ?? null,
                feedbackConfig: user.feedbackConfig ?? null,
                classificationConfig: user.classificationConfig ?? null,
                welcomeMarkdown: user.welcomeMarkdown ?? null,
              }
            : {}),
        });
      },

      // Source of truth for auth: the httpOnly session cookie via /api/auth/me.
      hydrateAuth: async () => {
        try {
          const res = await fetch('/api/auth/me');
          const data = await res.json();
          if (data.user) {
            get().setAuthUser(data.user);
            return true;
          }
          set({
            currentUser: null,
            userId: null,
            userType: null,
            isAuthenticated: false,
            isAdmin: false,
            authHydrated: true,
          });
          return false;
        } catch (error) {
          console.error('Auth hydration error:', error);
          set({ authHydrated: true });
          return false;
        }
      },

      // Learner picks an educator: adopt that educator's global age setting + name.
      setAdminContext: (adminUserId, age, adminName) => {
        set({ adminUserId, age: age ?? null, adminName: adminName ?? null });
      },

      loadUserScenarios: async () => {
        const { userId, userType, adminUserId } = get();
        if (!userId) return;

        try {
          const targetUserId = userType === 'user' ? adminUserId : userId;

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

      setAge: async (age: number | null) => {
        const { userId } = get();
        if (!userId) return;

        set({ age });

        try {
          await fetch('/api/get-admin-info', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, age }),
          });
        } catch (error) {
          console.error('Error updating age:', error);
        }
      },

      // Persist the educator's feedback/classification prompt overrides. Pass null for
      // a config to clear it back to system defaults.
      saveAdminPrompts: async (feedbackConfig, classificationConfig) => {
        const { userId } = get();
        if (!userId) return;

        set({ feedbackConfig, classificationConfig });

        try {
          await fetch('/api/get-admin-info', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, feedbackConfig, classificationConfig }),
          });
        } catch (error) {
          console.error('Error updating prompts:', error);
        }
      },

      // Persist the educator's Welcome-screen markdown (empty string = no welcome screen).
      saveWelcomeMarkdown: async (welcomeMarkdown) => {
        const { userId } = get();
        if (!userId) return;

        set({ welcomeMarkdown });

        try {
          await fetch('/api/get-admin-info', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, welcomeMarkdown }),
          });
        } catch (error) {
          console.error('Error updating welcome content:', error);
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

          set((state) => {
            const prev = state.scenarios.find((s) => s.id === id);
            // The cached VT session holds the last predicted stage. If the starting
            // stage or auto/fixed mode changed, that session is stale — drop it so the
            // chat reseeds from the new stage instead of showing the old predicted one.
            const stageChanged =
              (updates.stage !== undefined && updates.stage !== prev?.stage) ||
              (updates.autoStage !== undefined && updates.autoStage !== prev?.autoStage) ||
              (updates.minStage !== undefined && updates.minStage !== prev?.minStage) ||
              (updates.maxStage !== undefined && updates.maxStage !== prev?.maxStage);
            const vtSessions = { ...state.vtSessions };
            if (stageChanged) delete vtSessions[id];
            return {
              scenarios: state.scenarios.map((scenario) =>
                scenario.id === id ? { ...scenario, ...updates } : scenario
              ),
              vtSessions,
            };
          });
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

      // Replace the educator's scenarios with the study defaults (destructive; the admin UI
      // confirms first). Returns the freshly-seeded scenarios into the store.
      restoreDefaultScenarios: async () => {
        const { userId } = get();
        if (!userId) return;

        const response = await fetch('/api/restore-default-scenarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });

        if (!response.ok) {
          throw new Error('Failed to restore default scenarios');
        }

        const data = await response.json();
        set({ scenarios: data.scenarios || [] });
      },

      getScenarioBySlug: (slug: string) => {
        return get().scenarios.find(s => s.slug === slug);
      },

      saveUserMessage: async (scenarioId: number, message: Message) => {
        const { userId } = get();
        if (!userId) return;

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
        const { userId } = get();
        if (!userId) return;

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

      saveResponseClassification: async (scenarioId, messageId, payload) => {
        const { userId } = get();
        if (!userId) return null;

        try {
          const res = await fetch('/api/messages', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, scenarioId, messageId, ...payload }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return (data?.progress ?? null) as ProgressUpdate | null;
        } catch (error) {
          console.error('Error saving classification:', error);
          return null;
        }
      },

      savePreviewEvent: async (scenarioId, payload) => {
        const { userId } = get();
        if (!userId) return;

        try {
          await fetch('/api/preview-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, scenarioId, ...payload }),
          });
        } catch (error) {
          console.error('Error logging preview event:', error);
        }
      },

      loadUserMessages: async (scenarioId: number) => {
        const { userId } = get();
        if (!userId) return [];

        try {
          const response = await fetch(`/api/messages?userId=${userId}&scenarioId=${scenarioId}`);

          if (!response.ok) {
            throw new Error('Failed to load messages');
          }

          const messages = await response.json();
          return messages.map((msg: Partial<Message> & { timestamp: string | Date }) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }));
        } catch (error) {
          console.error('Error loading messages:', error);
          return [];
        }
      },

      loadUserFeedbacks: async (scenarioId: number) => {
        const { userId } = get();
        if (!userId) return new Map();

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

      // Mark a scenario's splash modal as seen (so it won't auto-open again).
      markSplashSeen: (scenarioId) => {
        set((state) => ({ splashSeen: { ...state.splashSeen, [scenarioId]: true } }));
      },

      // Forget "seen" flags so the splash auto-opens again — for specific scenarios (on
      // refresh) or all of them (on module reset). No arg = clear everything.
      clearSplashSeen: (scenarioIds) => {
        set((state) => {
          if (!scenarioIds) return { splashSeen: {} };
          const next = { ...state.splashSeen };
          for (const id of scenarioIds) delete next[id];
          return { splashSeen: next };
        });
      },

      recordScenarioVisit: async (scenarioId: number) => {
        const { userId } = get();
        if (!userId) return;

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

      // Record a lifecycle exit for this scenario: 'completed' (final-scenario "End Chat")
      // or 'comfort_exit' ("I don't feel comfortable anymore."). Stamps the matching
      // timestamp column on scenario_progress for downstream research analysis.
      recordScenarioLifecycle: async (scenarioId, kind) => {
        const { userId } = get();
        if (!userId) return;

        try {
          await fetch('/api/scenario-progress', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, scenarioId, kind }),
          });
        } catch (error) {
          console.error('Error recording scenario lifecycle:', error);
        }
      },

      loadScenarioProgress: async () => {
        const { userId } = get();
        if (!userId) return new Map();

        try {
          const response = await fetch(`/api/scenario-progress?userId=${userId}`);

          if (!response.ok) {
            throw new Error('Failed to load scenario progress');
          }

          const progressData = await response.json();
          const progressMap = new Map<number, ScenarioProgress>();

          Object.entries(progressData).forEach(([scenarioId, progress]) => {
            const prog = progress as {
              scenarioId: number; firstVisitedAt: string; lastVisitedAt: string; visitCount: number;
              protectiveCount?: number; neutralCount?: number; vulnerableCount?: number;
              protectiveRate?: number | null; masteryReachedAt?: number | null;
              comfortExitAt?: number | null; completedAt?: number | null;
            };
            progressMap.set(parseInt(scenarioId), {
              scenarioId: prog.scenarioId,
              firstVisitedAt: new Date(prog.firstVisitedAt),
              lastVisitedAt: new Date(prog.lastVisitedAt),
              visitCount: prog.visitCount,
              protectiveCount: prog.protectiveCount,
              neutralCount: prog.neutralCount,
              vulnerableCount: prog.vulnerableCount,
              protectiveRate: prog.protectiveRate ?? null,
              masteryReachedAt: prog.masteryReachedAt ? new Date(prog.masteryReachedAt) : null,
              comfortExitAt: prog.comfortExitAt ? new Date(prog.comfortExitAt) : null,
              completedAt: prog.completedAt ? new Date(prog.completedAt) : null,
            });
          });

          return progressMap;
        } catch (error) {
          console.error('Error loading scenario progress:', error);
          return new Map();
        }
      },

      resetScenarioProgress: async (scenarioId: number) => {
        const { userId } = get();
        if (!userId) return;

        try {
          await fetch(`/api/scenario-progress?userId=${userId}&scenarioId=${scenarioId}`, {
            method: 'DELETE',
          });
          // Drop any cached VT session for this scenario.
          set((state) => {
            const next = { ...state.vtSessions };
            delete next[scenarioId];
            return { vtSessions: next };
          });
        } catch (error) {
          console.error('Error resetting scenario progress:', error);
        }
      },

      setVtSession: (scenarioId: number, vtSessionId: string | null, autoStage: number | null, seededStage: number | null = null) => {
        set((state) => ({
          vtSessions: { ...state.vtSessions, [scenarioId]: { vtSessionId, autoStage, seededStage } },
        }));
      },

      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
          console.error('Logout error:', error);
        }
        set({
          currentUser: null,
          userId: null,
          userType: null,
          scenarios: [],
          age: null,
          isAuthenticated: false,
          isAdmin: false,
          adminUserId: null,
          adminName: null,
          vtSessions: {},
        });
      },

      deleteAccount: async () => {
        const { userId, userType } = get();
        if (!userId || userType !== 'admin') {
          throw new Error('Only admin accounts can be deleted');
        }

        try {
          const response = await fetch('/api/delete-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          });

          if (!response.ok) {
            throw new Error('Failed to delete account');
          }

          await get().logout();
        } catch (error) {
          console.error('Error deleting account:', error);
          throw error;
        }
      },
    }),
    {
      name: 'rylai-store',
      version: 4,
      // Auth (userId/userType/isAuthenticated) is intentionally NOT persisted —
      // it is hydrated from the httpOnly session cookie via hydrateAuth().
      partialize: (state) => ({
        adminUserId: state.adminUserId,
        adminName: state.adminName,
        scenarios: state.scenarios,
        age: state.age,
        vtSessions: state.vtSessions,
        splashSeen: state.splashSeen,
      }),
    }
  )
);
