"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

// Shapes mirror /api/educator/transcript.
interface TranscriptMessage {
  messageId: string;
  text: string;
  sender: "user" | "other";
  stage: number | null;
  classification: "protective" | "neutral" | "vulnerable" | null;
  responseType: string | null;
  timestamp: number;
  feedback: string | null;
}
interface TranscriptRun {
  // The reset that ended this run; null for the run still in progress.
  archivedAt: number | null;
  messages: TranscriptMessage[];
}

const LABEL: Record<string, { text: string; cls: string }> = {
  protective: { text: "Protective", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  neutral: { text: "Neutral", cls: "bg-gray-50 text-gray-600 border-gray-200" },
  vulnerable: { text: "Vulnerable", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

const fmt = (ms: number) => new Date(ms).toLocaleString();

// Read-only transcript of one participant's conversation in one scenario, opened from the
// participant Details modal. Shows the live run plus any runs preserved when the learner used
// Restart / Reset all, newest run selected first — an educator asking "what happened here"
// almost always means the current attempt.
export default function TranscriptModal({
  userId,
  scenarioId,
  participant,
  onClose,
}: {
  userId: string;
  scenarioId: number;
  participant: string;
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<TranscriptRun[] | null>(null);
  const [scenarioName, setScenarioName] = useState("");
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/educator/transcript?userId=${encodeURIComponent(userId)}&scenarioId=${scenarioId}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setRuns(data.runs ?? []);
        setScenarioName(data.scenarioName ?? "");
        setSelected(Math.max(0, (data.runs?.length ?? 1) - 1)); // the live run
      } catch (err) {
        console.error("Failed to load transcript:", err);
        if (!cancelled) setError("Couldn't load this transcript.");
      }
    })();
    return () => { cancelled = true; };
  }, [userId, scenarioId]);

  const run = runs?.[selected];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-12"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold leading-tight text-gray-900">
              {scenarioName || "Transcript"}
            </h3>
            <p className="text-xs text-gray-500">{participant}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Run picker — only meaningful once the learner has started over at least once. */}
        {runs && runs.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-b border-gray-100 px-6 py-3">
            {runs.map((r, i) => (
              <button
                key={r.archivedAt ?? "live"}
                onClick={() => setSelected(i)}
                title={r.archivedAt ? `Restarted ${fmt(r.archivedAt)}` : "Still in progress"}
                className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  i === selected
                    ? "border-purple-300 bg-purple-50 text-purple-700"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {r.archivedAt ? `Attempt ${i + 1}` : "Current"}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-[8rem] overflow-y-auto px-6 py-4">
          {error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : !runs ? (
            <p className="text-sm italic text-gray-400">Loading…</p>
          ) : !run || run.messages.length === 0 ? (
            <p className="text-sm italic text-gray-400">
              {run?.archivedAt === null
                ? "Nothing in the current attempt yet."
                : "No messages in this run."}
            </p>
          ) : (
            <>
              {run.archivedAt !== null && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Earlier attempt, kept when the participant restarted on {fmt(run.archivedAt)}.
                </p>
              )}
              <ol className="space-y-3">
                {run.messages.map((m, i) => {
                  const mine = m.sender === "user";
                  const label = m.classification ? LABEL[m.classification] : null;
                  return (
                    <li key={`${m.messageId}-${i}`} className={mine ? "pl-8" : "pr-8"}>
                      <div
                        className={`rounded-xl border px-3 py-2 ${
                          mine ? "border-purple-100 bg-purple-50/60" : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                          <span className="font-semibold text-gray-500">
                            {mine ? "Participant" : "Stranger"}
                          </span>
                          <span>{fmt(m.timestamp)}</span>
                          {m.stage !== null && <span>Stage {m.stage}</span>}
                          {label && (
                            <span className={`rounded border px-1.5 py-0.5 font-medium ${label.cls}`}>
                              {label.text}
                            </span>
                          )}
                          {m.responseType && <span>{m.responseType.replace(/_/g, " ")}</span>}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{m.text}</p>
                      </div>
                      {m.feedback && (
                        <div className="mt-1.5 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs leading-relaxed text-gray-700">
                          <span className="font-semibold text-blue-700">Feedback shown: </span>
                          <span className="whitespace-pre-wrap">{m.feedback}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
