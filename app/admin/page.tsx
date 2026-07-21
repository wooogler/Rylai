"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, MessageSquare, Download, Upload, LogOut, Check, RotateCcw, Loader2, AlertCircle } from "lucide-react";
import { useScenarioStore, type Scenario, type Message, GROOMING_STAGES } from "../store/useScenarioStore";
import Button from "@/components/Button";
import PromptEditor, {
  type FeedbackEdit,
  type ClassificationEdit,
  toFeedbackEdit,
  toClassificationEdit,
  fromFeedbackEdit,
  fromClassificationEdit,
} from "./PromptEditor";
import PromptPreview from "./PromptPreview";
import AccessCodes from "./AccessCodes";
import Markdown from "@/components/Markdown";
import { DEFAULT_WELCOME_MARKDOWN, DEFAULT_CLOSING_MARKDOWN } from "@/lib/welcome-content";
import type { StageEscalationConfig, StageEscalationStep } from "@/lib/db/schema";

// The stage steps an educator can configure: leaving stage 1 (the 1→2 step) … leaving stage 5.
// Stage 6 is terminal, so it has no step.
const STAGE_STEPS = [1, 2, 3, 4, 5] as const;
const DEFAULT_MIN_VULNERABLE = 2;

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Slugs are used in the chat URL, so they must be unique within an educator's set.
// If the base slug is already taken, append -2, -3, ...
function uniqueSlug(base: string, taken: string[]): string {
  const root = base || 'scenario';
  const set = new Set(taken);
  if (!set.has(root)) return root;
  let n = 2;
  while (set.has(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}

function generateHandle(predatorName: string): string {
  const nameParts = predatorName.toLowerCase().split(' ');
  const firstName = nameParts[0] || 'user';
  const lastInitial = nameParts[1] ? nameParts[1][0] : '';
  const randomNum = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${firstName}_${lastInitial}_${randomNum}`;
}

export default function AdminPage() {
  const router = useRouter();
  const {
    userId,
    scenarios,
    age,
    feedbackConfig,
    classificationConfig,
    welcomeMarkdown,
    closingMarkdown,
    stageEscalation,
    isAdmin,
    isAuthenticated,
    authHydrated,
    currentUser,
    logout,
    addScenario,
    deleteScenario,
    updateScenario,
    restoreDefaultScenarios,
    setAge,
    saveAdminPrompts,
    saveWelcomeMarkdown,
    saveClosingMarkdown,
    saveStageEscalation,
    deleteAccount
  } = useScenarioStore();

  // Redirect if not authenticated or not admin (wait for cookie hydration first)
  useEffect(() => {
    if (authHydrated && (!isAuthenticated || !isAdmin)) {
      router.push('/');
    }
  }, [authHydrated, isAuthenticated, isAdmin, router]);
  const [editingScenarios, setEditingScenarios] = useState<Scenario[]>([]);
  const [editingAge, setEditingAge] = useState<number | null>(null);
  const [editFeedback, setEditFeedback] = useState<FeedbackEdit>(() => toFeedbackEdit(null));
  const [editClassification, setEditClassification] = useState<ClassificationEdit>(() =>
    toClassificationEdit(null)
  );
  const [editWelcome, setEditWelcome] = useState<string>('');
  const [showWelcomePreview, setShowWelcomePreview] = useState(false);
  const [editClosing, setEditClosing] = useState<string>('');
  const [editEscalate, setEditEscalate] = useState<StageEscalationConfig>({});
  const [showClosingPreview, setShowClosingPreview] = useState(false);
  const [splashPreview, setSplashPreview] = useState<Record<number, boolean>>({});
  // Auto-save status shown where the old "Save Changes" button was.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isRestoring, setIsRestoring] = useState(false);
  const [activeTab, setActiveTab] = useState<'scenarios' | 'prompts' | 'preview' | 'access'>('access');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Safe auto-save plumbing -------------------------------------------------------------
  // dirtyRef: edits exist that a save hasn't captured yet.
  // savingRef: a save round-trip is currently in flight.
  // saveTimerRef: the pending debounce timer.
  // initedRef: the edit buffers have been hydrated from the store at least once.
  // latestRef: an always-current snapshot of the edit buffers, read by the debounced saver
  //            (which fires from a timeout and would otherwise see stale closure values).
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initedRef = useRef(false);
  const latestRef = useRef({ editingScenarios, editingAge, editFeedback, editClassification, editWelcome, editClosing, editEscalate });
  latestRef.current = { editingScenarios, editingAge, editFeedback, editClassification, editWelcome, editClosing, editEscalate };

  // Backfill newer per-scenario fields so older persisted/imported scenarios keep every input
  // controlled (no undefined -> defined warning). Shared by the sync effect and Add.
  const backfillScenario = (s: Scenario): Scenario => ({
    ...s,
    minStage: s.minStage ?? 1,
    maxStage: s.maxStage ?? 6,
    masteryEnabled: s.masteryEnabled ?? false,
    masteryTargetRate: s.masteryTargetRate ?? 80,
    masteryMinResponses: s.masteryMinResponses ?? 20,
    masteryThreshold: s.masteryThreshold ?? 5,
    minExchangesPerStage: s.minExchangesPerStage ?? 5,
    persistMessages: s.persistMessages ?? false,
    timeGapLabel: s.timeGapLabel ?? '',
    splashMarkdown: s.splashMarkdown ?? null,
    assessmentMode: s.assessmentMode ?? false,
    maxMessages: s.maxMessages ?? 0,
  });

  // The actual save: persists global settings + UPDATES existing scenarios. Adds and deletes
  // are applied immediately by their handlers (so every buffered scenario already has a real,
  // server-assigned id), which is what keeps auto-save from ever duplicating a new scenario.
  const flushSave = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (savingRef.current) return; // a save is already running; it re-checks dirty when it ends
    const snap = latestRef.current;
    dirtyRef.current = false; // capture point — edits after this re-arm dirty and reschedule
    savingRef.current = true;
    setSaveStatus('saving');
    try {
      await setAge(snap.editingAge);
      await saveAdminPrompts(
        fromFeedbackEdit(snap.editFeedback),
        fromClassificationEdit(snap.editClassification)
      );
      await saveWelcomeMarkdown(snap.editWelcome);
      await saveClosingMarkdown(snap.editClosing);
      await saveStageEscalation(snap.editEscalate);

      const storeIds = new Set(useScenarioStore.getState().scenarios.map((s) => s.id));
      for (const scenario of snap.editingScenarios) {
        if (storeIds.has(scenario.id)) {
          await updateScenario(scenario.id, scenario);
        }
      }

      savingRef.current = false;
      if (dirtyRef.current) {
        scheduleSave(); // more edits arrived mid-save — capture them
      } else {
        setSaveStatus('saved');
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
      savingRef.current = false;
      dirtyRef.current = true; // leave as unsaved so a later flush retries
      setSaveStatus('error');
    }
  };

  // Mark the buffers dirty and (re)arm the debounce. Called by every field-edit handler.
  const scheduleSave = () => {
    dirtyRef.current = true;
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void flushSave();
    }, 800);
  };

  // Copy the live store into the edit buffers. Used by the sync effect (initial load /
  // external change) and imperatively after Import, where the store is replaced while a save
  // is in flight and the effect would otherwise leave the buffers stale.
  const hydrateBuffersFromStore = () => {
    const st = useScenarioStore.getState();
    const cloned: Scenario[] = JSON.parse(JSON.stringify(st.scenarios));
    setEditingScenarios(cloned.map(backfillScenario));
    setEditingAge(st.age);
    setEditFeedback(toFeedbackEdit(st.feedbackConfig));
    setEditClassification(toClassificationEdit(st.classificationConfig));
    setEditWelcome(st.welcomeMarkdown ?? '');
    setEditClosing(st.closingMarkdown ?? '');
    setEditEscalate(st.stageEscalation ?? {});
    initedRef.current = true;
  };

  useEffect(() => {
    // Pull the store into the edit buffers on first load and on genuinely external
    // replacements (Restore defaults, both of which run while dirtyRef is false). Skip while
    // the educator is mid-edit or a save is in flight — re-cloning then would clobber the
    // buffer (lost keystrokes / cursor jump) or race the save. (Import re-hydrates itself,
    // since it replaces the store while savingRef is held.)
    if (dirtyRef.current || savingRef.current) return;
    hydrateBuffersFromStore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarios, age, feedbackConfig, classificationConfig, welcomeMarkdown, closingMarkdown, stageEscalation]);

  // Warn before leaving with an unsaved/in-flight edit (auto-save is debounced, so a fast
  // tab-close could otherwise drop the last change).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || savingRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Patch one stage step of the global escalation policy (keeps the other steps intact).
  const updateStageStep = (fromStage: number, patch: Partial<StageEscalationStep>) => {
    setEditEscalate((prev) => {
      const key = String(fromStage);
      const cur = prev[key];
      return {
        ...prev,
        [key]: {
          enabled: cur?.enabled ?? false,
          minVulnerable: cur?.minVulnerable ?? DEFAULT_MIN_VULNERABLE,
          ...patch,
        },
      };
    });
    scheduleSave();
  };

  const handleUpdateScenario = <K extends keyof Scenario>(index: number, field: K, value: Scenario[K]) => {
    const updated = [...editingScenarios];

    if (field === 'name') {
      const taken = updated.filter((_, i) => i !== index).map(s => s.slug);
      updated[index] = {
        ...updated[index],
        name: value as string,
        slug: uniqueSlug(generateSlug(value as string), taken),
      };
    } else if (field === 'predatorName') {
      updated[index] = {
        ...updated[index],
        predatorName: value as string,
        handle: generateHandle(value as string),
      };
    } else {
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
    }

    setEditingScenarios(updated);
    scheduleSave();
  };

  // Update several scenario fields at once (e.g. starting stage + max stage together,
  // which must stay consistent — calling handleUpdateScenario twice would race on state).
  const handleUpdateScenarioFields = (index: number, fields: Partial<Scenario>) => {
    const updated = [...editingScenarios];
    updated[index] = { ...updated[index], ...fields };
    setEditingScenarios(updated);
    scheduleSave();
  };

  const handleUpdateMessage = (scenarioIndex: number, messageIndex: number, text: string) => {
    const updated = [...editingScenarios];
    updated[scenarioIndex].presetMessages[messageIndex].text = text;
    setEditingScenarios(updated);
    scheduleSave();
  };

  const handleAddMessage = (scenarioIndex: number, sender: "user" | "other") => {
    const updated = [...editingScenarios];
    const newMessage: Message = {
      id: Date.now().toString(),
      text: "",
      sender,
      timestamp: new Date(),
    };
    updated[scenarioIndex].presetMessages.push(newMessage);
    setEditingScenarios(updated);
    scheduleSave();
  };

  const handleDeleteMessage = (scenarioIndex: number, messageIndex: number) => {
    const updated = [...editingScenarios];
    updated[scenarioIndex].presetMessages.splice(messageIndex, 1);
    setEditingScenarios(updated);
    scheduleSave();
  };

  const handleAddScenario = async () => {
    const draft: Omit<Scenario, 'id'> = {
      slug: uniqueSlug("new-scenario", editingScenarios.map(s => s.slug)),
      name: "New Scenario",
      predatorName: "New Predator",
      handle: "new_predator",
      presetMessages: [],
      description: "New scenario description",
      stage: 1,
      autoStage: true,
      minStage: 1,
      maxStage: 6,
      masteryEnabled: false,
      masteryTargetRate: 80,
      masteryMinResponses: 20,
      masteryThreshold: 5,
      minExchangesPerStage: 5,
      persistMessages: false,
      timeGapLabel: '',
      splashMarkdown: null,
      assessmentMode: false,
      maxMessages: 0,
    };
    // Persist immediately so the new scenario gets its real, DB-assigned id up front. The
    // debounced auto-save only ever UPDATES existing scenarios, so creating here (rather than
    // with a temporary client id the saver would fail to match) is what prevents duplicates.
    setSaveStatus('saving');
    try {
      const created = await addScenario(draft);
      if (created) {
        setEditingScenarios((prev) => [...prev, backfillScenario(created)]);
      }
      if (!dirtyRef.current && !savingRef.current) setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to add scenario:', error);
      setSaveStatus('error');
    }
  };

  const handleDeleteScenario = async (index: number) => {
    const target = editingScenarios[index];
    if (!target) return;
    // Destructive (cascades to learner messages/feedback/progress) — keep the confirm.
    if (!confirm(
      `Delete scenario "${target.name}"?\n\n` +
      `This permanently removes it along with every learner message, feedback entry, and ` +
      `progress record tied to it.\n\nThis cannot be undone.`
    )) {
      return;
    }
    // Optimistically drop it from the buffer, then persist the delete right away.
    setEditingScenarios((prev) => prev.filter((_, i) => i !== index));
    const inStore = useScenarioStore.getState().scenarios.some((s) => s.id === target.id);
    if (!inStore) return; // never saved — local removal is enough
    setSaveStatus('saving');
    try {
      await deleteScenario(target.id);
      if (!dirtyRef.current && !savingRef.current) setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to delete scenario:', error);
      setSaveStatus('error');
    }
  };

  // Replace all scenarios with the two default RYLAI study scenarios. Destructive: wipes
  // learner messages/feedback/progress tied to the current scenarios (cascade delete).
  const handleRestoreDefaults = async () => {
    if (!confirm(
      `Restore the default study scenarios?\n\n` +
      `This REPLACES all current scenarios with the two default RYLAI scenarios ` +
      `(Scenario 1 and Scenario 2). For every existing scenario it will permanently delete ` +
      `all learner messages, feedback, and progress.\n\n` +
      `This cannot be undone.`
    )) {
      return;
    }
    setIsRestoring(true);
    // Abandon any pending auto-save; we're replacing everything from the server, and the
    // sync effect will re-hydrate the buffers once the store updates.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtyRef.current = false;
    try {
      await restoreDefaultScenarios();
      setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to restore default scenarios:', error);
      alert('Failed to restore default scenarios. Please try again.');
      setSaveStatus('error');
    } finally {
      setIsRestoring(false);
    }
  };

  // Apply an imported bundle as one immediate, full reconcile (globals + add/update/delete
  // scenarios to match the file), then let the sync effect re-hydrate the buffers. Import is
  // a discrete user action, not a background save, so it can safely add/delete here.
  const applyImportedSettings = async (
    list: Scenario[],
    globals: {
      age?: number | null;
      feedbackConfig?: ReturnType<typeof fromFeedbackEdit>;
      classificationConfig?: ReturnType<typeof fromClassificationEdit>;
      welcome?: string;
      closing?: string;
      escalate?: StageEscalationConfig;
    }
  ) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtyRef.current = false;
    savingRef.current = true;
    setSaveStatus('saving');
    try {
      if (globals.age !== undefined) await setAge(globals.age);
      if (globals.feedbackConfig !== undefined || globals.classificationConfig !== undefined) {
        const st = useScenarioStore.getState();
        await saveAdminPrompts(
          globals.feedbackConfig !== undefined ? globals.feedbackConfig : st.feedbackConfig,
          globals.classificationConfig !== undefined ? globals.classificationConfig : st.classificationConfig
        );
      }
      if (globals.welcome !== undefined) await saveWelcomeMarkdown(globals.welcome);
      if (globals.closing !== undefined) await saveClosingMarkdown(globals.closing);
      if (globals.escalate !== undefined) await saveStageEscalation(globals.escalate);

      // Reconcile scenarios: update where the file's id matches an existing one (preserving
      // its learner data), add the rest, delete store scenarios absent from the file.
      const storeIds = new Set(useScenarioStore.getState().scenarios.map((s) => s.id));
      const keptIds = new Set<number>();
      for (const s of list) {
        if (typeof s.id === 'number' && storeIds.has(s.id)) {
          await updateScenario(s.id, s);
          keptIds.add(s.id);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, ...rest } = s;
          const created = await addScenario(rest);
          if (created) keptIds.add(created.id);
        }
      }
      for (const s of useScenarioStore.getState().scenarios) {
        if (!keptIds.has(s.id)) await deleteScenario(s.id);
      }

      savingRef.current = false;
      hydrateBuffersFromStore(); // the effect was suppressed during the in-flight reconcile
      setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to import settings:', error);
      savingRef.current = false;
      setSaveStatus('error');
      alert('Failed to import settings. Please try again.');
    }
  };

  const handleExport = () => {
    // Bundle scenarios together with the educator's global settings: learner age and
    // the feedback / classification prompt overrides (sparse — only fields that differ
    // from the system defaults, or null when everything is default).
    const exportData = {
      version: 2,
      age: editingAge,
      feedbackConfig: fromFeedbackEdit(editFeedback),
      classificationConfig: fromClassificationEdit(editClassification),
      welcomeMarkdown: editWelcome,
      closingMarkdown: editClosing,
      stageEscalation: editEscalate,
      scenarios: editingScenarios,
    };
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    link.href = url;
    link.download = `rylai-settings-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const imported = JSON.parse(content);

        // Support old formats (a bare scenarios array, or { scenarios, age }) as well as
        // the current format, which also carries the feedback / classification prompt
        // overrides. Prompt fields are only applied when present in the file. Older exports
        // predate per-scenario fields like maxStage; backfillScenario fills them in.
        const rawList: Scenario[] | null = Array.isArray(imported)
          ? imported
          : imported && Array.isArray(imported.scenarios)
            ? imported.scenarios
            : null;
        if (!rawList) {
          alert('Failed to import settings. Please check the file format.');
          return;
        }

        // Import now persists immediately (there's no separate Save step), so warn: it
        // replaces the current scenarios and removes any not in the file (with their data).
        if (!confirm(
          `Import settings from this file?\n\n` +
          `This replaces your current scenarios and prompt settings with the file's. ` +
          `Scenarios not in the file — and their learner data — will be removed.\n\n` +
          `This cannot be undone.`
        )) {
          return;
        }

        const list = rawList.map(backfillScenario);
        const globals: {
          age?: number | null;
          feedbackConfig?: ReturnType<typeof fromFeedbackEdit>;
          classificationConfig?: ReturnType<typeof fromClassificationEdit>;
          welcome?: string;
          closing?: string;
          escalate?: StageEscalationConfig;
        } = {};
        if (!Array.isArray(imported)) {
          if ('age' in imported) {
            globals.age = typeof imported.age === 'number' ? imported.age : null;
          }
          if ('feedbackConfig' in imported) {
            globals.feedbackConfig = fromFeedbackEdit(toFeedbackEdit(imported.feedbackConfig ?? null));
          }
          if ('classificationConfig' in imported) {
            globals.classificationConfig = fromClassificationEdit(toClassificationEdit(imported.classificationConfig ?? null));
          }
          if ('welcomeMarkdown' in imported) {
            globals.welcome = typeof imported.welcomeMarkdown === 'string' ? imported.welcomeMarkdown : '';
          }
          if ('closingMarkdown' in imported) {
            globals.closing = typeof imported.closingMarkdown === 'string' ? imported.closingMarkdown : '';
          }
          if ('stageEscalation' in imported) {
            globals.escalate = (imported.stageEscalation ?? {}) as StageEscalationConfig;
          }
        }

        void applyImportedSettings(list, globals);
      } catch (error) {
        alert("Failed to import settings. Please check the file format.");
        console.error(error);
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be imported again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm(
      `⚠️ WARNING: Delete Account "${currentUser}"?\n\n` +
      `This will PERMANENTLY delete:\n` +
      `• Your admin account\n` +
      `• All ${scenarios.length} scenarios\n` +
      `• All learner progress data\n` +
      `• All messages and feedback\n\n` +
      `This action CANNOT be undone!\n\n` +
      `Type "DELETE" to confirm.`
    )) {
      return;
    }

    const confirmation = prompt('Type "DELETE" to confirm account deletion:');
    if (confirmation !== "DELETE") {
      alert("Account deletion cancelled.");
      return;
    }

    try {
      await deleteAccount();
      alert("Account deleted successfully.");
      router.push("/");
    } catch (error) {
      console.error("Failed to delete account:", error);
      alert("Failed to delete account. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            {/* Account actions */}
            <div className="flex gap-2">
              <Button
                onClick={handleDeleteAccount}
                variant="ghost"
                size="small"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-1.5 inline" />
                Delete Account
              </Button>
              <Button
                onClick={async () => {
                  await flushSave(); // don't drop a pending edit on the way out
                  await logout();
                  router.push("/");
                }}
                variant="ghost"
                size="small"
              >
                <LogOut className="w-4 h-4 mr-1.5 inline" />
                Logout
              </Button>
            </div>

            {/* Work actions: import/export · test · save */}
            <div className="flex gap-2 items-center">
              <Button
                onClick={handleExport}
                variant="ghost"
                size="small"
              >
                <Download className="w-4 h-4 mr-1.5 inline" />
                Export
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="ghost"
                size="small"
              >
                <Upload className="w-4 h-4 mr-1.5 inline" />
                Import
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
              <div className="w-px h-5 bg-gray-200" aria-hidden />
              <div className="relative group">
                <Button
                  onClick={async () => {
                    // Flush any pending edit so Test Chat opens the just-saved version.
                    await flushSave();
                    const first = useScenarioStore.getState().scenarios[0];
                    if (first) router.push(`/chat/${first.slug}`);
                  }}
                  disabled={scenarios.length === 0}
                  variant="secondary"
                  size="small"
                  className={scenarios.length === 0 ? 'pointer-events-none' : undefined}
                >
                  <MessageSquare className="w-4 h-4 mr-1.5 inline" />
                  Test Chat
                </Button>
                {scenarios.length === 0 && (
                  <div className="absolute z-50 hidden group-hover:block top-full right-0 mt-2 w-56 p-2.5 rounded-lg bg-gray-900 text-white text-xs font-normal shadow-xl leading-snug">
                    Add a scenario before testing.
                  </div>
                )}
              </div>
              {/* Auto-save status (replaces the old "Save Changes" button) */}
              <div className="min-w-[150px] flex items-center justify-end" aria-live="polite">
                {saveStatus === 'saving' ? (
                  <span className="inline-flex items-center text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Saving…
                  </span>
                ) : saveStatus === 'error' ? (
                  <button
                    type="button"
                    onClick={() => { void flushSave(); }}
                    className="inline-flex items-center text-sm text-red-600 hover:text-red-700 hover:underline"
                  >
                    <AlertCircle className="w-4 h-4 mr-1.5" />
                    Save failed — retry
                  </button>
                ) : (
                  <span className={`inline-flex items-center text-sm ${saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400'}`}>
                    <Check className="w-4 h-4 mr-1.5" />
                    All changes saved
                  </span>
                )}
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-bold">Educator Settings</h1>
          <p className="text-gray-600 mt-2">
            Manage your training scenarios, customize how feedback is written and how
            learner replies are classified, and preview or test the prompts against the
            model. Export or import bundles your scenarios together with these prompt
            settings.
          </p>
        </div>

        {/* Top-level tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {([
            { key: 'access', label: 'Distribution' },
            { key: 'scenarios', label: 'Scenarios' },
            { key: 'prompts', label: 'Prompts' },
            { key: 'preview', label: 'Preview & Test' },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Feedback & Classification Prompts tab */}
        {activeTab === 'prompts' && (
          <div className="mb-8">
            <p className="text-sm text-gray-600 mb-4">
              Customize the learner age group, how feedback is written, and how learner
              replies are classified. Fields are prefilled with the system defaults; edit
              any of them, or use &quot;Revert to default&quot; to restore. Changes apply to
              all of your scenarios. Use the <strong>Preview &amp; Test</strong> tab to see
              the assembled prompt and run it against the model.
            </p>
            <PromptEditor
              feedback={editFeedback}
              classification={editClassification}
              age={editingAge}
              onAgeChange={(next) => {
                setEditingAge(next);
                scheduleSave();
              }}
              onFeedbackChange={(next) => {
                setEditFeedback(next);
                scheduleSave();
              }}
              onClassificationChange={(next) => {
                setEditClassification(next);
                scheduleSave();
              }}
            />
          </div>
        )}

        {/* Preview & Test tab */}
        {activeTab === 'preview' && (
          <div className="mb-8">
            <PromptPreview
              feedback={editFeedback}
              classification={editClassification}
            />
          </div>
        )}

        {/* Distribution tab: class link, student roster, access codes */}
        {activeTab === 'access' && userId && (
          <div className="mb-8">
            <AccessCodes educatorUsername={currentUser ?? ''} />
          </div>
        )}

        {/* Scenario Settings tab */}
        {activeTab === 'scenarios' && (
        <div>
          {/* Welcome screen (educator-wide, shown before the first scenario) */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-xl font-semibold">Welcome screen</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Shown to learners after they pick you, before the first scenario (Markdown). Leave empty to skip it.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowWelcomePreview((v) => !v)}
                  className="text-sm font-medium text-purple-600 hover:text-purple-800"
                >
                  {showWelcomePreview ? 'Edit' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditWelcome(DEFAULT_WELCOME_MARKDOWN); scheduleSave(); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                  title="Reset to the default welcome content"
                >
                  Reset to default
                </button>
              </div>
            </div>
            {showWelcomePreview ? (
              <div className="mt-3 min-h-[8rem] rounded-lg border border-gray-200 bg-gray-50 p-4">
                {editWelcome.trim()
                  ? <Markdown>{editWelcome}</Markdown>
                  : <p className="text-sm italic text-gray-400">No welcome content — learners will go straight to the first scenario.</p>}
              </div>
            ) : (
              <textarea
                value={editWelcome}
                onChange={(e) => { setEditWelcome(e.target.value); scheduleSave(); }}
                rows={10}
                placeholder="Welcome content (Markdown)…"
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            )}
          </div>

          {/* Closing screen (educator-wide, shown when the learner finishes the last scenario) */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-xl font-semibold">Closing screen</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Shown to learners when they select <span className="font-medium">Finish</span> on the last scenario (Markdown). Leave empty to use the built-in default.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowClosingPreview((v) => !v)}
                  className="text-sm font-medium text-purple-600 hover:text-purple-800"
                >
                  {showClosingPreview ? 'Edit' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditClosing(DEFAULT_CLOSING_MARKDOWN); scheduleSave(); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                  title="Reset to the default closing content"
                >
                  Reset to default
                </button>
              </div>
            </div>
            {showClosingPreview ? (
              <div className="mt-3 min-h-[8rem] rounded-lg border border-gray-200 bg-gray-50 p-4">
                {editClosing.trim()
                  ? <Markdown>{editClosing}</Markdown>
                  : <Markdown>{DEFAULT_CLOSING_MARKDOWN}</Markdown>}
              </div>
            ) : (
              <textarea
                value={editClosing}
                onChange={(e) => { setEditClosing(e.target.value); scheduleSave(); }}
                rows={10}
                placeholder="Closing content (Markdown)… leave empty to use the default"
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            )}
          </div>

          {/* Stage progression (global — one row per stage step, applies to every scenario) */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="text-xl font-semibold">Stage progression</h3>
            <p className="text-sm text-gray-500 mt-0.5 mb-1">
              How the online stranger moves up the grooming stages. Applies to all of your scenarios.
            </p>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Turn on a step to control it: the stranger stays at that stage until the learner has given the set number
              of <span className="font-medium text-rose-600">vulnerable</span> replies there, then moves up one stage.
              <span className="font-medium text-emerald-600"> Protective</span> and neutral replies never count, so a
              learner who keeps responding safely holds the stranger back. Steps left off are decided by the AI.
            </p>

            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-[1fr_7rem_9rem] gap-3 bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <span>Stage step</span>
                <span className="text-center">Control it</span>
                <span className="text-center">Vulnerable replies</span>
              </div>
              {STAGE_STEPS.map((from) => {
                const step = editEscalate[String(from)];
                const enabled = !!step?.enabled;
                const minV = step?.minVulnerable ?? DEFAULT_MIN_VULNERABLE;
                const fromName = GROOMING_STAGES.find((g) => g.stage === from)?.name ?? '';
                const toName = GROOMING_STAGES.find((g) => g.stage === from + 1)?.name ?? '';
                return (
                  <div
                    key={from}
                    className="grid grid-cols-[1fr_7rem_9rem] gap-3 items-center px-4 py-3 border-t border-gray-100"
                  >
                    <div>
                      <span className="block text-sm font-medium text-gray-800">Stage {from} &rarr; {from + 1}</span>
                      <span className="block text-xs text-gray-500">{fromName} &rarr; {toName}</span>
                    </div>
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        aria-label={`Control the stage ${from} to ${from + 1} step`}
                        checked={enabled}
                        onChange={(e) => updateStageStep(from, { enabled: e.target.checked })}
                        className="h-4 w-4 accent-purple-600 cursor-pointer"
                      />
                    </div>
                    <div className="flex justify-center">
                      {enabled ? (
                        <input
                          type="number"
                          min={1}
                          aria-label={`Vulnerable replies needed to leave stage ${from}`}
                          value={minV}
                          onChange={(e) =>
                            updateStageStep(from, { minVulnerable: Math.max(1, parseInt(e.target.value) || 1) })
                          }
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      ) : (
                        <span className="text-xs italic text-gray-400">AI decides</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scenarios List */}
          <div className="space-y-6">
          {editingScenarios.map((scenario, scenarioIndex) => (
            <div key={scenario.id} className="bg-white rounded-lg shadow-md p-6">
              {/* Scenario Title */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold">Scenario {scenarioIndex + 1}</h3>
                <button
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete Scenario ${scenarioIndex + 1}?`)) {
                      handleDeleteScenario(scenarioIndex);
                    }
                  }}
                  className="text-red-600 hover:text-red-800"
                  title="Delete Scenario"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              {/* Scenario Header */}
              <div className="flex justify-between items-start mb-6">
                <div className="flex-1 space-y-4">
                  {/* Identity: name + online stranger name */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Scenario Name
                      </label>
                      <input
                        type="text"
                        value={scenario.name}
                        onChange={(e) => handleUpdateScenario(scenarioIndex, 'name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Online Stranger Name
                      </label>
                      <input
                        type="text"
                        value={scenario.predatorName}
                        onChange={(e) => handleUpdateScenario(scenarioIndex, 'predatorName', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={scenario.description}
                      onChange={(e) => handleUpdateScenario(scenarioIndex, 'description', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* Splash screen (shown when a learner first enters this scenario) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700">
                        Splash screen (Markdown)
                      </label>
                      <button
                        type="button"
                        onClick={() => setSplashPreview((p) => ({ ...p, [scenario.id]: !p[scenario.id] }))}
                        className="text-sm font-medium text-purple-600 hover:text-purple-800"
                      >
                        {splashPreview[scenario.id] ? 'Edit' : 'Preview'}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      Shown as a modal when a learner first enters this scenario. Leave empty for no splash.
                    </p>
                    {splashPreview[scenario.id] ? (
                      <div className="min-h-[6rem] rounded-lg border border-gray-200 bg-gray-50 p-4">
                        {(scenario.splashMarkdown ?? '').trim()
                          ? <Markdown>{scenario.splashMarkdown ?? ''}</Markdown>
                          : <p className="text-sm italic text-gray-400">No splash content.</p>}
                      </div>
                    ) : (
                      <textarea
                        value={scenario.splashMarkdown ?? ''}
                        onChange={(e) => handleUpdateScenario(scenarioIndex, 'splashMarkdown', e.target.value)}
                        rows={8}
                        placeholder="Splash content (Markdown)…"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    )}
                  </div>

                  {/* Auto Stage toggle (+ its dependent min-exchanges setting) */}
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-start gap-3">
                      <input
                        id={`auto-stage-${scenario.id}`}
                        type="checkbox"
                        checked={scenario.autoStage}
                        onChange={(e) => handleUpdateScenario(scenarioIndex, 'autoStage', e.target.checked)}
                        className="mt-1 h-4 w-4 accent-purple-600 cursor-pointer"
                      />
                      <label htmlFor={`auto-stage-${scenario.id}`} className="cursor-pointer">
                        <span className="block text-sm font-medium text-gray-800">
                          Automatically change the grooming stage
                        </span>
                        <span className="block text-xs text-gray-500">
                          When on, the model changes the stage as the conversation develops and
                          responds accordingly — it can move <span className="font-medium">up or down</span> between
                          the minimum and maximum stages below. When off, the conversation stays
                          fixed at the chosen stage.
                        </span>
                      </label>
                    </div>

                    {scenario.autoStage && (
                      <div className="mt-3 ml-7 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
                        <label htmlFor={`min-exch-${scenario.id}`} className="text-xs text-gray-600">
                          Minimum exchanges at a stage before it can escalate
                        </label>
                        <input
                          id={`min-exch-${scenario.id}`}
                          type="number"
                          min={0}
                          value={scenario.minExchangesPerStage ?? 5}
                          onChange={(e) => handleUpdateScenario(scenarioIndex, 'minExchangesPerStage', Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-xs text-gray-400">(0 = no minimum; protective replies also hold the stage)</span>
                      </div>
                    )}
                  </div>

                  {/* Stage controls: starting stage, plus min/max bounds in auto mode */}
                  <div>
                    <div className={`grid ${scenario.autoStage ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {scenario.autoStage ? 'Starting Stage' : 'Fixed Stage'}
                        </label>
                        <select
                          value={scenario.stage}
                          onChange={(e) => {
                            const newStage = parseInt(e.target.value);
                            // Keep bounds consistent: minStage ≤ startingStage ≤ maxStage.
                            const minStage = Math.min(scenario.minStage ?? 1, newStage);
                            const maxStage = Math.max(scenario.maxStage ?? 6, newStage);
                            handleUpdateScenarioFields(scenarioIndex, { stage: newStage, minStage, maxStage });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value={1}>Stage 1: Friendship Forming</option>
                          <option value={2}>Stage 2: Relationship Forming</option>
                          <option value={3}>Stage 3: Risk Assessment</option>
                          <option value={4}>Stage 4: Exclusivity</option>
                          <option value={5}>Stage 5: Sexual</option>
                          <option value={6}>Stage 6: Conclusion</option>
                        </select>
                      </div>
                      {scenario.autoStage && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Minimum Stage
                          </label>
                          <select
                            value={scenario.minStage ?? 1}
                            onChange={(e) => handleUpdateScenarioFields(scenarioIndex, { minStage: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                          >
                            {GROOMING_STAGES.filter((g) => g.stage <= scenario.stage).map((g) => (
                              <option key={g.stage} value={g.stage}>
                                Stage {g.stage}: {g.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {scenario.autoStage && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Maximum Stage
                          </label>
                          <select
                            value={scenario.maxStage ?? 6}
                            onChange={(e) => handleUpdateScenarioFields(scenarioIndex, { maxStage: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                          >
                            {GROOMING_STAGES.filter((g) => g.stage >= scenario.stage).map((g) => (
                              <option key={g.stage} value={g.stage}>
                                Stage {g.stage}: {g.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    {scenario.autoStage && (
                      <p className="text-xs text-gray-500 mt-1.5">
                        In auto mode the online stranger moves only between the minimum and maximum
                        stages, beginning at the starting stage.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Preset Messages */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preset Messages
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  {scenario.persistMessages && scenarioIndex !== 0
                    ? "The online stranger re-opens this scenario with these messages, shown after the carried-over conversation and the time-gap separator."
                    : "Shown at the start of the conversation (usually the online stranger's opening messages)."}
                </p>
                <div className="space-y-3">
                  {scenario.presetMessages.map((message, messageIndex) => (
                    <div
                      key={message.id}
                      className="flex gap-3 items-center"
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                        message.sender === "user" ? "bg-purple-500 text-white" : "bg-gray-300"
                      }`}>
                        {message.sender === "other" ? "S" : "U"}
                      </div>
                      <div className="flex-1 flex gap-2 items-center">
                        <input
                          type="text"
                          value={message.text}
                          onChange={(e) => handleUpdateMessage(scenarioIndex, messageIndex, e.target.value)}
                          className={`flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                            message.sender === "user" ? "bg-purple-50" : "bg-gray-50"
                          }`}
                          placeholder={message.sender === "user" ? "User message" : "Online stranger message"}
                        />
                        <button
                          onClick={() => handleDeleteMessage(scenarioIndex, messageIndex)}
                          className="text-red-600 hover:text-red-800 flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Message Buttons */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleAddMessage(scenarioIndex, "other")}
                    className="flex items-center px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Online Stranger Message
                  </button>
                  <button
                    onClick={() => handleAddMessage(scenarioIndex, "user")}
                    className="flex items-center px-3 py-2 text-sm bg-purple-100 hover:bg-purple-200 rounded-lg"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add User Message
                  </button>
                </div>
              </div>

              {/* Scenario behavior toggles (bottom, side by side) */}
              <div className="mt-6 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Safe Response Rate gate */}
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-start gap-3">
                    <input
                      id={`mastery-${scenario.id}`}
                      type="checkbox"
                      checked={!!scenario.masteryEnabled}
                      onChange={(e) => handleUpdateScenario(scenarioIndex, 'masteryEnabled', e.target.checked)}
                      className="mt-1 h-4 w-4 accent-purple-600 cursor-pointer"
                    />
                    <label htmlFor={`mastery-${scenario.id}`} className="cursor-pointer">
                      <span className="block text-sm font-medium text-gray-800">
                        Require a safe response rate to continue
                      </span>
                      <span className="block text-xs text-gray-500">
                        When on, the learner can&apos;t advance until their Safe Response Rate reaches the
                        target. The rate is safe (protective or neutral) replies ÷ Max(min&nbsp;responses,
                        total replies) — risky replies delay progress, and a few early replies can&apos;t
                        inflate it. Once reached, the next scenario stays unlocked.
                      </span>
                    </label>
                  </div>
                  {scenario.masteryEnabled && (
                    <div className="mt-3 ml-7 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="flex items-center gap-2">
                        <label htmlFor={`mastery-target-${scenario.id}`} className="text-xs text-gray-600">
                          Target rate (%)
                        </label>
                        <input
                          id={`mastery-target-${scenario.id}`}
                          type="number"
                          min={1}
                          max={100}
                          value={scenario.masteryTargetRate ?? 80}
                          onChange={(e) => handleUpdateScenario(scenarioIndex, 'masteryTargetRate', Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label htmlFor={`mastery-min-${scenario.id}`} className="text-xs text-gray-600">
                          Min responses
                        </label>
                        <input
                          id={`mastery-min-${scenario.id}`}
                          type="number"
                          min={1}
                          value={scenario.masteryMinResponses ?? 20}
                          onChange={(e) => handleUpdateScenario(scenarioIndex, 'masteryMinResponses', Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Persist messages */}
                <div className={`bg-gray-50 rounded-lg p-3 border border-gray-200 ${scenarioIndex === 0 ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <input
                      id={`persist-${scenario.id}`}
                      type="checkbox"
                      checked={!!scenario.persistMessages}
                      disabled={scenarioIndex === 0}
                      onChange={(e) => handleUpdateScenario(scenarioIndex, 'persistMessages', e.target.checked)}
                      className="mt-1 h-4 w-4 accent-purple-600 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <label htmlFor={`persist-${scenario.id}`} className={scenarioIndex === 0 ? 'cursor-not-allowed' : 'cursor-pointer'}>
                      <span className="block text-sm font-medium text-gray-800">
                        Continue the previous scenario&apos;s conversation
                      </span>
                      <span className="block text-xs text-gray-500">
                        {scenarioIndex === 0
                          ? "Not available for the first scenario — there's no previous conversation to continue."
                          : "When on, this scenario shows the previous scenario's conversation for context, then the time-gap separator, then this scenario's preset messages — the predator re-opening the new conversation."}
                      </span>
                    </label>
                  </div>
                  {scenario.persistMessages && scenarioIndex !== 0 && (
                    <div className="mt-3 ml-7 flex items-center gap-2">
                      <label htmlFor={`timegap-${scenario.id}`} className="whitespace-nowrap text-xs text-gray-600">
                        Time-gap separator
                      </label>
                      <input
                        id={`timegap-${scenario.id}`}
                        type="text"
                        value={scenario.timeGapLabel ?? ''}
                        onChange={(e) => handleUpdateScenario(scenarioIndex, 'timeGapLabel', e.target.value)}
                        placeholder="e.g. 3 months later"
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Assessment mode (6.1b) — full width */}
              <div className="mt-4 bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div className="flex items-start gap-3">
                  <input
                    id={`assess-${scenario.id}`}
                    type="checkbox"
                    checked={!!scenario.assessmentMode}
                    onChange={(e) => handleUpdateScenario(scenarioIndex, 'assessmentMode', e.target.checked)}
                    className="mt-1 h-4 w-4 accent-amber-600 cursor-pointer"
                  />
                  <label htmlFor={`assess-${scenario.id}`} className="cursor-pointer">
                    <span className="block text-sm font-medium text-gray-800">Assessment mode (predator only)</span>
                    <span className="block text-xs text-gray-500">
                      For the post-training assessment: the online stranger progresses naturally with no
                      stage display, no feedback, and no protective-rate gate. The conversation ends once
                      the participant has sent the number of replies set below.
                    </span>
                  </label>
                </div>
                {scenario.assessmentMode && (
                  <div className="mt-3 ml-7 flex flex-wrap items-center gap-2">
                    <label htmlFor={`maxmsg-${scenario.id}`} className="text-xs text-gray-600">
                      End after this many participant replies
                    </label>
                    <input
                      id={`maxmsg-${scenario.id}`}
                      type="number"
                      min={0}
                      value={scenario.maxMessages ?? 0}
                      onChange={(e) => handleUpdateScenario(scenarioIndex, 'maxMessages', Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-xs text-gray-400">(0 = no limit; counts the participant&apos;s own replies)</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          </div>

          {/* Add / Restore Scenario Buttons */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={handleAddScenario}
            className="flex items-center px-6 py-3 bg-purple-600 text-white hover:bg-purple-700 rounded-lg font-medium"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add New Scenario
          </button>
          <button
            onClick={handleRestoreDefaults}
            disabled={isRestoring}
            className="flex items-center px-6 py-3 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            title="Replace all scenarios with the two default RYLAI study scenarios"
          >
            <RotateCcw className={`w-5 h-5 mr-2 ${isRestoring ? 'animate-spin' : ''}`} />
            {isRestoring ? 'Restoring…' : 'Restore default scenarios'}
          </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
