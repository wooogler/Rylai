"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Save, MessageSquare, Download, Upload } from "lucide-react";
import Link from "next/link";
import { useScenarioStore, type Scenario, type Message } from "../store/useScenarioStore";
import Button from "@/components/Button";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function AdminPage() {
  const router = useRouter();
  const {
    scenarios,
    commonSystemPrompt,
    feedbackPersona,
    feedbackInstruction,
    addScenario,
    deleteScenario,
    updateScenario,
    setCommonSystemPrompt,
    setFeedbackPrompts
  } = useScenarioStore();
  const [editingScenarios, setEditingScenarios] = useState<Scenario[]>([]);
  const [editingCommonPrompt, setEditingCommonPrompt] = useState("");
  const [editingFeedbackPersona, setEditingFeedbackPersona] = useState("");
  const [editingFeedbackInstruction, setEditingFeedbackInstruction] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditingScenarios(JSON.parse(JSON.stringify(scenarios)));
    setEditingCommonPrompt(commonSystemPrompt);
    setEditingFeedbackPersona(feedbackPersona);
    setEditingFeedbackInstruction(feedbackInstruction);
  }, [scenarios, commonSystemPrompt, feedbackPersona, feedbackInstruction]);

  const handleUpdateScenario = <K extends keyof Scenario>(index: number, field: K, value: Scenario[K]) => {
    const updated = [...editingScenarios];

    if (field === 'name') {
      updated[index] = {
        ...updated[index],
        name: value as string,
        slug: generateSlug(value as string),
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
      slug: "new-scenario",
      name: "New Scenario",
      predatorName: "New Predator",
      handle: "new_predator",
      systemPrompt: "",
      presetMessages: [],
      description: "New scenario description",
      stage: 1,
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
      // Save common system prompt
      await setCommonSystemPrompt(editingCommonPrompt);

      // Save feedback prompts
      await setFeedbackPrompts(editingFeedbackPersona, editingFeedbackInstruction);

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
      alert("Scenarios saved successfully!");
    } catch (error) {
      console.error("Error saving scenarios:", error);
      alert("Failed to save scenarios. Please try again.");
    }
  };

  const handleExport = () => {
    const exportData = {
      commonSystemPrompt: editingCommonPrompt,
      feedbackPersona: editingFeedbackPersona,
      feedbackInstruction: editingFeedbackInstruction,
      scenarios: editingScenarios,
    };
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    link.href = url;
    link.download = `scenarios-${timestamp}.json`;
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

        // Support both old format (array only) and new format (with scenarios key)
        if (Array.isArray(imported)) {
          setEditingScenarios(imported);
        } else if (imported.scenarios) {
          setEditingScenarios(imported.scenarios);
          if (imported.commonSystemPrompt) {
            setEditingCommonPrompt(imported.commonSystemPrompt);
          }
          if (imported.feedbackPersona) {
            setEditingFeedbackPersona(imported.feedbackPersona);
          }
          if (imported.feedbackInstruction) {
            setEditingFeedbackInstruction(imported.feedbackInstruction);
          }
        }

        setHasChanges(true);
        alert("Scenarios imported successfully!");
      } catch (error) {
        alert("Failed to import scenarios. Please check the file format.");
        console.error(error);
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be imported again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Home
            </Link>
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
                onClick={() => router.push(`/chat/${scenarios[0].slug}`)}
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
            </div>
          </div>
          <h1 className="text-3xl font-bold">Admin Settings</h1>
          <p className="text-gray-600 mt-2">
            Configure prompts and scenarios for your educational scenarios
          </p>
        </div>

        {/* Feedback Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Feedback Settings</h2>

          {/* Feedback Prompts */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-4">
            <h3 className="text-lg font-semibold mb-3">Feedback Prompts</h3>
            <p className="text-sm text-gray-600 mb-4">
              Customize how the AI provides feedback to learners after conversations.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Persona (Role Definition)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Define the AI&apos;s role and perspective when giving feedback.
                </p>
                <textarea
                  value={editingFeedbackPersona}
                  onChange={(e) => {
                    setEditingFeedbackPersona(e.target.value);
                    setHasChanges(true);
                  }}
                  rows={2}
                  placeholder="You are an educational assistant helping learners..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Instruction (Feedback Guidelines)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Specify what the feedback should focus on and how it should be structured.
                </p>
                <textarea
                  value={editingFeedbackInstruction}
                  onChange={(e) => {
                    setEditingFeedbackInstruction(e.target.value);
                    setHasChanges(true);
                  }}
                  rows={8}
                  placeholder="Provide constructive feedback focusing on..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Scenario Section */}
        <div>
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Scenario Settings</h2>

          {/* Common System Prompt */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Common System Prompt</h2>
          <p className="text-sm text-gray-600 mb-3">
            This prompt will be appended to all scenario-specific prompts.
          </p>
          <textarea
            value={editingCommonPrompt}
            onChange={(e) => {
              setEditingCommonPrompt(e.target.value);
              setHasChanges(true);
            }}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
          />
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
                    <p className="text-xs text-gray-500 mt-1">Slug: {scenario.slug}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Predator Name
                      </label>
                      <input
                        type="text"
                        value={scenario.predatorName}
                        onChange={(e) => handleUpdateScenario(scenarioIndex, 'predatorName', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Handle
                      </label>
                      <input
                        type="text"
                        value={scenario.handle}
                        onChange={(e) => handleUpdateScenario(scenarioIndex, 'handle', e.target.value)}
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
                </div>
              </div>

              {/* System Prompt */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  System Prompt
                </label>
                <textarea
                  value={scenario.systemPrompt}
                  onChange={(e) => handleUpdateScenario(scenarioIndex, 'systemPrompt', e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                />
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
                        {message.sender === "other" ? "P" : "U"}
                      </div>
                      <div className="flex-1 flex gap-2 items-center">
                        <input
                          type="text"
                          value={message.text}
                          onChange={(e) => handleUpdateMessage(scenarioIndex, messageIndex, e.target.value)}
                          className={`flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                            message.sender === "user" ? "bg-purple-50" : "bg-gray-50"
                          }`}
                          placeholder={message.sender === "user" ? "User message" : "Predator message"}
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
                    Add Predator Message
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
      </div>
    </div>
  );
}
