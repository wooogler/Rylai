"use client";

import { useState, useMemo } from "react";
import { Play, Plus, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { StageKey, ResponseType } from "@/lib/db/schema";
import { buildFeedbackAndClassificationInput } from "@/lib/feedback-prompts";
import { STAGE_KEYS } from "@/lib/classification-criteria";
import {
  GROOMING_STAGES,
  CLASSIFICATION_META,
  RESPONSE_TYPE_META,
  type ResponseLabel,
} from "../store/useScenarioStore";
import {
  type FeedbackEdit,
  type ClassificationEdit,
  fromFeedbackEdit,
  fromClassificationEdit,
} from "./PromptEditor";

interface TestResult {
  feedback: string;
  classification: ResponseLabel;
  responseType: ResponseType;
  tacticRecognized: boolean;
  protectiveStrategy: boolean;
  rationale: string;
}

interface SampleMessage {
  id: string;
  sender: "user" | "other";
  text: string;
}

const DEFAULT_SAMPLE_MESSAGES: SampleMessage[] = [
  { id: "s1", sender: "other", text: "hey, we should keep chatting somewhere more private — what's your number?" },
  { id: "s2", sender: "user", text: "i'm good here, i don't really give out my number" },
];

function stageLabel(s: StageKey): string {
  const info = GROOMING_STAGES.find((g) => g.stage === s);
  return info ? `Stage ${s}: ${info.name}` : `Stage ${s}`;
}

// Sample messages → the "Online stranger: … / User: …" text the prompt uses.
function conversationText(messages: SampleMessage[]): string {
  return messages
    .map((m) => `${m.sender === "user" ? "User" : "Online stranger"}: ${m.text}`)
    .join("\n");
}

export default function PromptPreview({
  feedback,
  classification,
}: {
  feedback: FeedbackEdit;
  classification: ClassificationEdit;
}) {
  const [stage, setStage] = useState<StageKey>(1);
  const [messages, setMessages] = useState<SampleMessage[]>(DEFAULT_SAMPLE_MESSAGES);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateMessage = (id: string, text: string) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
  const addMessage = (sender: "user" | "other") =>
    setMessages((prev) => [...prev, { id: Date.now().toString(), sender, text: "" }]);
  const deleteMessage = (id: string) =>
    setMessages((prev) => prev.filter((m) => m.id !== id));

  // The exact string sent to the feedback model — built from the current (possibly
  // unsaved) Prompts-tab edits, the selected stage, and the sample conversation.
  const previewText = useMemo(
    () =>
      buildFeedbackAndClassificationInput(
        stage,
        conversationText(messages),
        fromFeedbackEdit(feedback),
        fromClassificationEdit(classification)
      ),
    [stage, messages, feedback, classification]
  );

  const runTest = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/feedback/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: previewText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data as TestResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run test");
    } finally {
      setRunning(false);
    }
  };

  const classMeta = result ? CLASSIFICATION_META[result.classification] : null;
  const typeMeta =
    result && result.responseType !== "none" ? RESPONSE_TYPE_META[result.responseType] : null;

  return (
    <div className="space-y-6">
      {/* Guide */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-900 leading-relaxed">
        This preview reflects your current <strong>Prompts</strong> tab settings, including
        unsaved edits. To change the prompt itself (persona, feedback style, label
        definitions, or anchors), edit it in the <strong>Prompts</strong> tab. The stage and
        sample conversation below only set up the test input.{" "}
        <strong>Run</strong> sends this exact input to the feedback model and shows its
        structured output — it does not require saving.
      </div>

      {/* Test input controls */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm font-semibold text-gray-700 mr-1">Stage:</span>
          {STAGE_KEYS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStage(s)}
              className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${
                stage === s
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              title={stageLabel(s)}
            >
              {s}
            </button>
          ))}
          <span className="text-xs text-gray-500 ml-1">{stageLabel(stage)}</span>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Sample conversation
        </label>
        <p className="text-xs text-gray-500 mb-3">
          The last <span className="font-mono">User</span> message is the reply being evaluated.
        </p>
        <div className="space-y-3">
          {messages.map((message) => (
            <div key={message.id} className="flex gap-3 items-center">
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                  message.sender === "user" ? "bg-purple-500 text-white" : "bg-gray-300"
                }`}
              >
                {message.sender === "other" ? "S" : "U"}
              </div>
              <div className="flex-1 flex gap-2 items-center">
                <input
                  type="text"
                  value={message.text}
                  onChange={(e) => updateMessage(message.id, e.target.value)}
                  className={`flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                    message.sender === "user" ? "bg-purple-50" : "bg-gray-50"
                  }`}
                  placeholder={message.sender === "user" ? "User message" : "Online stranger message"}
                />
                <button
                  onClick={() => deleteMessage(message.id)}
                  className="text-red-600 hover:text-red-800 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => addMessage("other")}
            className="flex items-center px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add online stranger message
          </button>
          <button
            onClick={() => addMessage("user")}
            className="flex items-center px-3 py-2 text-sm bg-purple-100 hover:bg-purple-200 rounded-lg"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add user message
          </button>
        </div>
      </div>

      {/* Assembled input + Run */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Assembled input</h3>
            <p className="text-xs text-gray-400">{previewText.length} chars</p>
          </div>
          <button
            type="button"
            onClick={runTest}
            disabled={running}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${
              running
                ? "bg-purple-300 text-white cursor-default"
                : "bg-purple-600 text-white hover:bg-purple-700"
            }`}
          >
            <Play className="w-4 h-4" />
            {running ? "Running…" : "Run with model"}
          </button>
        </div>
        <pre className="w-full max-h-80 overflow-auto px-3 py-2 text-xs leading-relaxed bg-gray-50 border border-gray-200 rounded-lg whitespace-pre-wrap break-words text-gray-800">
          {previewText}
        </pre>
      </div>

      {/* Model output */}
      {(running || result || error) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Model output</h3>

          {running && (
            <div className="flex items-center gap-1 text-gray-400">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse delay-75">●</span>
              <span className="animate-pulse delay-150">●</span>
              <span className="text-sm ml-1.5">Calling the feedback model…</span>
            </div>
          )}

          {error && !running && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </p>
          )}

          {result && !running && (
            <div className="space-y-4">
              {/* Labels */}
              <div className="flex flex-wrap items-center gap-2">
                {classMeta && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${classMeta.badge}`}>
                    {classMeta.label}
                  </span>
                )}
                {typeMeta && (
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded ${
                      typeMeta.polarity !== "none" ? CLASSIFICATION_META[typeMeta.polarity].badge : ""
                    }`}
                  >
                    {typeMeta.label}
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-1 rounded border ${
                    result.tacticRecognized
                      ? "border-green-300 text-green-700"
                      : "border-gray-200 text-gray-400"
                  }`}
                >
                  tacticRecognized: {String(result.tacticRecognized)}
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded border ${
                    result.protectiveStrategy
                      ? "border-green-300 text-green-700"
                      : "border-gray-200 text-gray-400"
                  }`}
                >
                  protectiveStrategy: {String(result.protectiveStrategy)}
                </span>
              </div>

              {/* Teen-facing feedback */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                  Feedback (shown to the learner)
                </p>
                <div className="text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-lg p-3">
                  <ReactMarkdown
                    components={{
                      p: (props) => <p className="mb-2 last:mb-0" {...props} />,
                      ul: (props) => <ul className="list-disc list-inside mb-2 space-y-0.5" {...props} />,
                      strong: (props) => <strong className="font-semibold text-gray-900" {...props} />,
                    }}
                  >
                    {result.feedback}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Rationale (researcher-only) */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                  Rationale (researcher-only, not shown to the learner)
                </p>
                <p className="text-sm text-gray-600">{result.rationale}</p>
              </div>

              {/* Raw JSON */}
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                  Raw JSON
                </summary>
                <pre className="mt-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg overflow-auto whitespace-pre-wrap break-words text-gray-700">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
