"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, MessageSquare, Download, Upload, LogOut, Check, RotateCcw } from "lucide-react";
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
import { DEFAULT_WELCOME_MARKDOWN } from "@/lib/welcome-content";

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
  const [splashPreview, setSplashPreview] = useState<Record<number, boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [activeTab, setActiveTab] = useState<'scenarios' | 'prompts' | 'preview' | 'access'>('scenarios');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Fill defaults for newer per-scenario fields so older persisted scenarios (which may
    // lack them) keep the inputs controlled (no undefined -> defined warning).
    const cloned: Scenario[] = JSON.parse(JSON.stringify(scenarios));
    setEditingScenarios(
      cloned.map((s) => ({
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
      }))
    );
    setEditingAge(age);
    setEditFeedback(toFeedbackEdit(feedbackConfig));
    setEditClassification(toClassificationEdit(classificationConfig));
    setEditWelcome(welcomeMarkdown ?? '');
  }, [scenarios, age, feedbackConfig, classificationConfig, welcomeMarkdown]);

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
    setHasChanges(true);
  };

  // Update several scenario fields at once (e.g. starting stage + max stage together,
  // which must stay consistent — calling handleUpdateScenario twice would race on state).
  const handleUpdateScenarioFields = (index: number, fields: Partial<Scenario>) => {
    const updated = [...editingScenarios];
    updated[index] = { ...updated[index], ...fields };
    setEditingScenarios(updated);
    setHasChanges(true);
  };

  const handleUpdateMessage = (scenarioIndex: number, messageIndex: number, text: string) => {
    const updated = [...editingScenarios];
    updated[scenarioIndex].presetMessages[messageIndex].text = text;
    setEditingScenarios(updated);
    setHasChanges(true);
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
    setHasChanges(true);
  };

  const handleDeleteMessage = (scenarioIndex: number, messageIndex: number) => {
    const updated = [...editingScenarios];
    updated[scenarioIndex].presetMessages.splice(messageIndex, 1);
    setEditingScenarios(updated);
    setHasChanges(true);
  };

  const handleAddScenario = () => {
    const newScenario: Scenario = {
      id: Math.max(...editingScenarios.map(s => s.id), 0) + 1,
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
    setEditingScenarios([...editingScenarios, newScenario]);
    setHasChanges(true);
  };

  const handleDeleteScenario = (index: number) => {
    const updated = [...editingScenarios];
    updated.splice(index, 1);
    setEditingScenarios(updated);
    setHasChanges(true);
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
    try {
      await restoreDefaultScenarios();
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to restore default scenarios:', error);
      alert('Failed to restore default scenarios. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSave = async () => {
    try {
      // Save the global age setting
      await setAge(editingAge);

      // Save the feedback / classification prompt overrides (null = system defaults)
      await saveAdminPrompts(
        fromFeedbackEdit(editFeedback),
        fromClassificationEdit(editClassification)
      );

      // Save the Welcome-screen content (empty = no welcome screen for learners)
      await saveWelcomeMarkdown(editWelcome);

      // Update existing scenarios
      for (const scenario of editingScenarios) {
        if (scenarios.find(s => s.id === scenario.id)) {
          await updateScenario(scenario.id, scenario);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, ...rest } = scenario;
          await addScenario(rest);
        }
      }

      // Delete scenarios that were removed
      for (const scenario of scenarios) {
        if (!editingScenarios.find(s => s.id === scenario.id)) {
          await deleteScenario(scenario.id);
        }
      }

      setHasChanges(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings. Please try again.");
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
        // overrides. Prompt fields are only applied when present in the file.
        // Older exports predate per-scenario fields like maxStage; backfill defaults.
        const withDefaults = (list: Scenario[]) =>
          list.map((s) => ({
            ...s,
            minStage: s.minStage ?? 1,
            maxStage: s.maxStage ?? 6,
            masteryTargetRate: s.masteryTargetRate ?? 80,
            masteryMinResponses: s.masteryMinResponses ?? 20,
            minExchangesPerStage: s.minExchangesPerStage ?? 5,
            timeGapLabel: s.timeGapLabel ?? '',
            splashMarkdown: s.splashMarkdown ?? null,
            assessmentMode: s.assessmentMode ?? false,
            maxMessages: s.maxMessages ?? 0,
          }));
        if (Array.isArray(imported)) {
          setEditingScenarios(withDefaults(imported));
        } else if (imported.scenarios) {
          setEditingScenarios(withDefaults(imported.scenarios));
          if ('age' in imported) {
            setEditingAge(typeof imported.age === 'number' ? imported.age : null);
          }
          if ('feedbackConfig' in imported) {
            setEditFeedback(toFeedbackEdit(imported.feedbackConfig ?? null));
          }
          if ('classificationConfig' in imported) {
            setEditClassification(toClassificationEdit(imported.classificationConfig ?? null));
          }
          if ('welcomeMarkdown' in imported) {
            setEditWelcome(typeof imported.welcomeMarkdown === 'string' ? imported.welcomeMarkdown : '');
          }
        }

        setHasChanges(true);
        alert("Settings imported successfully!");
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
                  onClick={() => scenarios[0] && router.push(`/chat/${scenarios[0].slug}`)}
                  disabled={scenarios.length === 0 || hasChanges}
                  variant="secondary"
                  size="small"
                  className={scenarios.length === 0 || hasChanges ? 'pointer-events-none' : undefined}
                >
                  <MessageSquare className="w-4 h-4 mr-1.5 inline" />
                  Test Chat
                </Button>
                {(hasChanges || scenarios.length === 0) && (
                  <div className="absolute z-50 hidden group-hover:block top-full right-0 mt-2 w-56 p-2.5 rounded-lg bg-gray-900 text-white text-xs font-normal shadow-xl leading-snug">
                    {hasChanges
                      ? 'Save your changes first — Test Chat opens the saved version of your scenarios.'
                      : 'Add a scenario before testing.'}
                  </div>
                )}
              </div>
              <Button
                onClick={handleSave}
                disabled={!hasChanges}
                variant="primary"
                size="small"
                className="inline-flex items-center justify-center min-w-[140px]"
              >
                {justSaved ? (
                  <>
                    <Check className="w-4 h-4 mr-1.5" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1.5" />
                    Save Changes
                  </>
                )}
              </Button>
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
            { key: 'scenarios', label: 'Scenarios' },
            { key: 'prompts', label: 'Prompts' },
            { key: 'preview', label: 'Preview & Test' },
            { key: 'access', label: 'Access Codes' },
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
                setHasChanges(true);
              }}
              onFeedbackChange={(next) => {
                setEditFeedback(next);
                setHasChanges(true);
              }}
              onClassificationChange={(next) => {
                setEditClassification(next);
                setHasChanges(true);
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

        {/* Access Codes tab */}
        {activeTab === 'access' && userId && (
          <div className="mb-8">
            <AccessCodes educatorId={userId} educatorUsername={currentUser ?? ''} />
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
                  onClick={() => { setEditWelcome(DEFAULT_WELCOME_MARKDOWN); setHasChanges(true); }}
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
                onChange={(e) => { setEditWelcome(e.target.value); setHasChanges(true); }}
                rows={10}
                placeholder="Welcome content (Markdown)…"
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            )}
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

                  {/* Auto Stage toggle */}
                  <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
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
                    <div className="ml-7 flex flex-wrap items-center gap-2">
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
              {scenario.persistMessages ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preset Messages
                  </label>
                  <div className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-300 rounded-lg p-3">
                    Disabled — this scenario continues the previous scenario&apos;s conversation,
                    so preset messages aren&apos;t used.
                  </div>
                </div>
              ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Preset Messages
                </label>
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
              )}

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
                      stage display, no feedback, and no protective-rate gate. The conversation ends after
                      the message limit below.
                    </span>
                  </label>
                </div>
                {scenario.assessmentMode && (
                  <div className="mt-3 ml-7 flex flex-wrap items-center gap-2">
                    <label htmlFor={`maxmsg-${scenario.id}`} className="text-xs text-gray-600">
                      End after this many messages
                    </label>
                    <input
                      id={`maxmsg-${scenario.id}`}
                      type="number"
                      min={0}
                      value={scenario.maxMessages ?? 0}
                      onChange={(e) => handleUpdateScenario(scenarioIndex, 'maxMessages', Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-xs text-gray-400">(0 = no limit; counts both sides)</span>
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
