"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, MessageSquare, Download, Upload, LogOut } from "lucide-react";
import { useScenarioStore, type Scenario, type Message } from "../store/useScenarioStore";
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
    scenarios,
    age,
    feedbackConfig,
    classificationConfig,
    isAdmin,
    isAuthenticated,
    authHydrated,
    currentUser,
    logout,
    addScenario,
    deleteScenario,
    updateScenario,
    setAge,
    saveAdminPrompts,
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
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'scenarios' | 'prompts' | 'preview'>('scenarios');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditingScenarios(JSON.parse(JSON.stringify(scenarios)));
    setEditingAge(age);
    setEditFeedback(toFeedbackEdit(feedbackConfig));
    setEditClassification(toClassificationEdit(classificationConfig));
  }, [scenarios, age, feedbackConfig, classificationConfig]);

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

  const handleSave = async () => {
    try {
      // Save the global age setting
      await setAge(editingAge);

      // Save the feedback / classification prompt overrides (null = system defaults)
      await saveAdminPrompts(
        fromFeedbackEdit(editFeedback),
        fromClassificationEdit(editClassification)
      );

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
      alert("Settings saved successfully!");
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
        if (Array.isArray(imported)) {
          setEditingScenarios(imported);
        } else if (imported.scenarios) {
          setEditingScenarios(imported.scenarios);
          if ('age' in imported) {
            setEditingAge(typeof imported.age === 'number' ? imported.age : null);
          }
          if ('feedbackConfig' in imported) {
            setEditFeedback(toFeedbackEdit(imported.feedbackConfig ?? null));
          }
          if ('classificationConfig' in imported) {
            setEditClassification(toClassificationEdit(imported.classificationConfig ?? null));
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
            <div>
              <Button
                onClick={handleDeleteAccount}
                variant="ghost"
                size="small"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-1.5 inline" />
                Delete Account
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleExport}
                variant="ghost"
                size="small"
              >
                <Download className="w-4 h-4 mr-1.5 inline" />
                Export JSON
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="ghost"
                size="small"
              >
                <Upload className="w-4 h-4 mr-1.5 inline" />
                Import JSON
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
              <Button
                onClick={() => scenarios[0] && router.push(`/chat/${scenarios[0].slug}`)}
                disabled={scenarios.length === 0}
                variant="secondary"
                size="small"
              >
                <MessageSquare className="w-4 h-4 mr-1.5 inline" />
                Go to Chat
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges}
                variant="primary"
                size="small"
              >
                <Save className="w-4 h-4 mr-1.5 inline" />
                Save Changes
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

        {/* Scenario Settings tab */}
        {activeTab === 'scenarios' && (
        <div>
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
                        {scenario.autoStage ? 'Starting Stage' : 'Fixed Stage'}
                      </label>
                      <select
                        value={scenario.stage}
                        onChange={(e) => handleUpdateScenario(scenarioIndex, 'stage', parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value={0}>Stage 0: Free Interaction</option>
                        <option value={1}>Stage 1: Friendship Forming</option>
                        <option value={2}>Stage 2: Relationship Forming</option>
                        <option value={3}>Stage 3: Risk Assessment</option>
                        <option value={4}>Stage 4: Exclusivity</option>
                        <option value={5}>Stage 5: Sexual</option>
                        <option value={6}>Stage 6: Conclusion</option>
                      </select>
                    </div>
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
                        responds accordingly — it can move <span className="font-medium">up or down</span> from
                        the starting stage above. When off, the conversation stays fixed at that stage.
                      </span>
                    </label>
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
                    <p className="text-xs text-gray-500 mt-1">Handle: {scenario.handle}</p>
                  </div>
                </div>
              </div>

              {/* Preset Messages */}
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
            </div>
          ))}
          </div>

          {/* Add Scenario Button */}
          <div className="mt-6">
          <button
            onClick={handleAddScenario}
            className="flex items-center px-6 py-3 bg-purple-600 text-white hover:bg-purple-700 rounded-lg font-medium"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add New Scenario
          </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
