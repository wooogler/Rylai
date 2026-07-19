"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Copy, Check, Link2, X } from "lucide-react";

// Per-scenario progress summary for the participant who redeemed a code (server-computed
// from scenario_progress — see /api/access-codes GET).
interface CodeProgress {
  scenarioId: number;
  scenarioName: string;
  protectiveRate: number | null;
  protectiveCount: number;
  neutralCount: number;
  vulnerableCount: number;
  masteryReachedAt: number | null;
  completedAt: number | null;
  comfortExitAt: number | null;
  visitCount: number;
  lastVisitedAt: number | null;
}

interface AccessCode {
  id: string;
  code: string;
  participantLabel: string;
  usedByUserId: string | null;
  usedByUsername: string | null;
  usedAt: number | null;
  createdAt: number;
  progress: CodeProgress[] | null;
}

const pct = (rate: number | null) => (rate === null ? null : Math.round(rate * 100));
const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : "—");
const fmtDay = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

// Participant access-code management (Evaluation Plan §6, L101–102). Educators issue codes /
// invite links here; learners must present an unused code to sign up, which then consumes it.
// Used codes show who redeemed them and a per-scenario progress summary (details in a modal).
export default function AccessCodes({ educatorId, educatorUsername }: { educatorId: string; educatorUsername: string }) {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [label, setLabel] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [count, setCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [detailCode, setDetailCode] = useState<AccessCode | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/access-codes?educatorId=${educatorId}`);
      if (res.ok) {
        const d = await res.json();
        setCodes(d.codes || []);
      }
    } catch (e) {
      console.error("Failed to load access codes:", e);
    }
  }, [educatorId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { educatorId, participantLabel: label };
      if (customCode.trim()) body.code = customCode.trim();
      else body.count = count;
      const res = await fetch("/api/access-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || "Failed to create access code(s).");
        return;
      }
      await load();
      setCustomCode("");
      setLabel("");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (c: AccessCode) => {
    if (c.usedByUserId && !confirm(
      `Delete code ${c.code}?\n\nIt was redeemed by "${c.usedByUsername}". Deleting the code does NOT delete their account or data — only this code record (and its row here).`
    )) {
      return;
    }
    await fetch(`/api/access-codes?id=${c.id}&educatorId=${educatorId}`, { method: "DELETE" });
    load();
  };

  // Invite link: /<educator>?code=<code> — the educator segment keeps study URLs
  // recognizable at a glance; the code pre-fills signup so participants only pick a
  // username + password.
  const inviteLink = (code: string) =>
    `${window.location.origin}/${encodeURIComponent(educatorUsername)}?code=${encodeURIComponent(code)}`;

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  };

  const usedCount = codes.filter((c) => !!c.usedByUserId).length;

  return (
    <div className="space-y-6">
      {/* Generate */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">Create access codes</h3>
        <p className="text-sm text-gray-500 mb-4">
          Participants need a code to sign up — share the <span className="font-medium">invite link</span> and
          they only pick a username and password. Enter a specific code (e.g.{" "}
          <span className="font-mono">p1-rylai</span>), or leave it blank to generate random ones.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Participant label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Participant 1"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Specific code (optional)</label>
            <input
              type="text"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              placeholder="e.g. p1-rylai"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          {!customCode.trim() && (
            <div>
              <label className="block text-xs text-gray-600 mb-1">How many</label>
              <input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          )}
          <button
            onClick={create}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {customCode.trim() ? "Add code" : "Generate"}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Codes</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {usedCount} joined
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
              {codes.length - usedCount} unused
            </span>
          </div>
        </div>
        {codes.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No access codes yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-2 pb-2 font-medium">Code</th>
                  <th className="px-2 pb-2 font-medium">Participant</th>
                  <th className="px-2 pb-2 font-medium">Progress</th>
                  <th className="px-2 pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {codes.map((c) => {
                  const used = !!c.usedByUserId;
                  return (
                    <tr key={c.id} className="group transition-colors hover:bg-gray-50/70">
                      {/* Code + label */}
                      <td className="px-2 py-3 align-middle">
                        <button
                          onClick={() => copy(`code-${c.id}`, c.code)}
                          className="inline-flex items-center gap-1.5 font-mono text-[13px] font-medium text-gray-800 hover:text-purple-700"
                          title="Copy code"
                        >
                          {c.code}
                          {copied === `code-${c.id}`
                            ? <Check className="w-3.5 h-3.5 text-emerald-600" />
                            : <Copy className="w-3.5 h-3.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />}
                        </button>
                        {c.participantLabel && (
                          <div className="mt-0.5 text-[11px] text-gray-400">{c.participantLabel}</div>
                        )}
                      </td>

                      {/* Participant (who redeemed it) */}
                      <td className="px-2 py-3 align-middle">
                        {used ? (
                          <div className="leading-tight">
                            <div className="text-[13px] font-medium text-gray-900">{c.usedByUsername ?? "unknown"}</div>
                            <div className="text-[11px] text-gray-400">joined {fmtDay(c.usedAt)}</div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                            Unused
                          </span>
                        )}
                      </td>

                      {/* Progress chips */}
                      <td className="px-2 py-3 align-middle">
                        {used && c.progress ? (
                          <div className="flex flex-wrap gap-1.5">
                            {c.progress.map((p, i) => {
                              const started = p.visitCount > 0;
                              const rate = pct(p.protectiveRate) ?? 0;
                              const reached = !!p.masteryReachedAt;
                              return (
                                <span
                                  key={p.scenarioId}
                                  title={`${p.scenarioName} — ${started ? `${rate}% safe${reached ? " · target reached" : ""}` : "not started"}`}
                                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
                                    reached
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : started
                                      ? "border-purple-200 bg-purple-50 text-purple-700"
                                      : "border-gray-200/70 bg-white text-gray-300"
                                  }`}
                                >
                                  S{i + 1}
                                  {started && <span>{rate}%</span>}
                                  {reached && <Check className="w-3 h-3" />}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>

                      {/* Actions — fixed three slots so every row lines up */}
                      <td className="px-2 py-3 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => copy(`link-${c.id}`, inviteLink(c.code))}
                            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-gray-500 transition-colors hover:bg-purple-50 hover:text-purple-700"
                            title={`Copy invite link\n${inviteLink(c.code)}`}
                          >
                            {copied === `link-${c.id}`
                              ? <Check className="w-3.5 h-3.5 text-emerald-600" />
                              : <Link2 className="w-3.5 h-3.5" />}
                            Copy link
                          </button>
                          <button
                            onClick={() => used && setDetailCode(c)}
                            disabled={!used}
                            className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-gray-500 transition-colors enabled:hover:bg-purple-50 enabled:hover:text-purple-700 disabled:pointer-events-none disabled:opacity-0"
                            aria-hidden={!used}
                          >
                            Details
                          </button>
                          <button
                            onClick={() => remove(c)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
                            title="Delete code"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Participant detail modal */}
      {detailCode && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-16" onClick={() => setDetailCode(null)}>
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold leading-tight text-gray-900">
                  {detailCode.usedByUsername ?? "Participant"}
                </h3>
                <p className="text-xs text-gray-500">
                  Code <span className="font-mono">{detailCode.code}</span>
                  {detailCode.participantLabel && <> · {detailCode.participantLabel}</>}
                  {" · joined "}{fmtDate(detailCode.usedAt)}
                </p>
              </div>
              <button
                onClick={() => setDetailCode(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto px-6 py-4">
              {detailCode.progress && detailCode.progress.length > 0 ? (
                <div className="space-y-4">
                  {detailCode.progress.map((p) => {
                    const rate = pct(p.protectiveRate);
                    const started = p.visitCount > 0;
                    return (
                      <div key={p.scenarioId} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold text-gray-900">{p.scenarioName}</h4>
                          {p.masteryReachedAt ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              <Check className="w-3 h-3" /> Target reached
                            </span>
                          ) : started ? (
                            <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">In progress</span>
                          ) : (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">Not started</span>
                          )}
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                          <div><dt className="text-gray-400">Safe rate</dt><dd className="font-medium text-gray-800">{started ? `${rate ?? 0}%` : "—"}</dd></div>
                          <div><dt className="text-gray-400">Replies (P · N · V)</dt><dd className="font-medium text-gray-800">{p.protectiveCount} · {p.neutralCount} · {p.vulnerableCount}</dd></div>
                          <div><dt className="text-gray-400">Visits</dt><dd className="font-medium text-gray-800">{p.visitCount}</dd></div>
                          <div><dt className="text-gray-400">Target reached</dt><dd className="font-medium text-gray-800">{fmtDate(p.masteryReachedAt)}</dd></div>
                          <div><dt className="text-gray-400">Ended (End Chat)</dt><dd className="font-medium text-gray-800">{fmtDate(p.completedAt)}</dd></div>
                          <div><dt className="text-gray-400">Comfort exit</dt><dd className="font-medium text-gray-800">{fmtDate(p.comfortExitAt)}</dd></div>
                          <div className="col-span-2 sm:col-span-3"><dt className="text-gray-400 inline">Last active:</dt>{" "}<dd className="inline font-medium text-gray-800">{fmtDate(p.lastVisitedAt)}</dd></div>
                        </dl>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm italic text-gray-400">No progress recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
