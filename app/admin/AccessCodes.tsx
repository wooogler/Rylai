"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Copy, Check, Link2, X, MessageSquare, Users } from "lucide-react";
import { useScenarioStore } from "../store/useScenarioStore";

// Per-scenario progress summary for a participant (server-computed from scenario_progress —
// see lib/progress/educator-progress.ts).
interface Progress {
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
  messageCount: number;
}

interface AccessCode {
  id: string;
  code: string;
  participantLabel: string;
  usedByUserId: string | null;
  usedByUsername: string | null;
  usedAt: number | null;
  createdAt: number;
  progress: Progress[] | null;
}

interface Student {
  id: string;
  username: string;
  createdAt: number;
  lastLoginAt: number | null;
  accessCode: string | null;
  participantLabel: string | null;
  progress: Progress[];
}

// What the details modal shows — either a student row or a redeemed code.
interface Detail {
  title: string;
  subtitle: string;
  progress: Progress[];
}

const pct = (rate: number | null) => (rate === null ? null : Math.round(rate * 100));
const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : "—");
const fmtDay = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

// Distribution tab. Students can only reach a class through the educator's link, so this is
// where that link lives, alongside the roster of everyone who has joined and the optional
// per-participant access codes (Evaluation Plan §6, L101–102).
export default function AccessCodes({ educatorUsername }: { educatorUsername: string }) {
  const { openEnrollment, saveOpenEnrollment } = useScenarioStore();
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [label, setLabel] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [count, setCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    try {
      const [codesRes, studentsRes] = await Promise.all([
        fetch("/api/access-codes"),
        fetch("/api/educator/students"),
      ]);
      if (codesRes.ok) setCodes((await codesRes.json()).codes || []);
      if (studentsRes.ok) setStudents((await studentsRes.json()).students || []);
    } catch (e) {
      console.error("Failed to load distribution data:", e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { participantLabel: label };
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
      `Delete code ${c.code}?\n\nIt was redeemed by "${c.usedByUsername}". Deleting the code does NOT delete their account or data — they stay in your Students list.`
    )) {
      return;
    }
    await fetch(`/api/access-codes?id=${c.id}`, { method: "DELETE" });
    load();
  };

  // The class link is the only student entry point. The `?code=` form binds a specific
  // participant; the plain form works whenever open enrollment is on.
  const classLink = `${origin}/${encodeURIComponent(educatorUsername)}`;
  const inviteLink = (code: string) => `${classLink}?code=${encodeURIComponent(code)}`;

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  };

  const usedCount = codes.filter((c) => !!c.usedByUserId).length;

  return (
    <div className="space-y-6">
      {/* Class link */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">Your class link</h3>
        <p className="text-sm text-gray-500 mb-4">
          Share this with your students — it is the only way into your class. They sign up
          here, and come back to the same link to log in later. Usernames are yours alone: a
          student in another educator&apos;s class can use the same name without a clash.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 min-w-[240px] truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
            {classLink}
          </code>
          <button
            onClick={() => copy("class-link", classLink)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            {copied === "class-link" ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            Copy link
          </button>
        </div>

        <label className="mt-4 flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/70 px-4 py-3">
          <input
            type="checkbox"
            checked={openEnrollment}
            onChange={(e) => saveOpenEnrollment(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <span className="text-sm">
            <span className="font-medium text-gray-800">
              Anyone with the class link can join
            </span>
            <span className="mt-0.5 block text-xs text-gray-500">
              {openEnrollment
                ? "Students sign up with just a username and password. Turn this off to require an access code."
                : "Access code required — only the per-participant invite links below can be used to sign up."}
            </span>
          </span>
        </label>
      </div>

      {/* Students */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Students</h3>
            <p className="text-sm text-gray-500">Everyone who has joined your class.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700">
            <Users className="h-3.5 w-3.5" />
            {students.length}
          </span>
        </div>
        {students.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            No students yet — share your class link to get started.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-2 pb-2 font-medium">Student</th>
                  <th className="px-2 pb-2 font-medium">Joined via</th>
                  <th className="px-2 pb-2 font-medium">Progress</th>
                  <th className="px-2 pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-gray-50/70">
                    <td className="px-2 py-3 align-middle">
                      <div className="text-[13px] font-medium text-gray-900">{s.username}</div>
                      <div className="text-[11px] text-gray-400">joined {fmtDay(s.createdAt)}</div>
                    </td>
                    <td className="px-2 py-3 align-middle">
                      {s.accessCode ? (
                        <div className="leading-tight">
                          <span className="font-mono text-[12px] text-gray-700">{s.accessCode}</span>
                          {s.participantLabel && (
                            <div className="text-[11px] text-gray-400">{s.participantLabel}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-gray-400">Class link</span>
                      )}
                    </td>
                    <td className="px-2 py-3 align-middle">
                      <ProgressChips progress={s.progress} />
                    </td>
                    <td className="px-2 py-3 align-middle text-right">
                      <button
                        onClick={() =>
                          setDetail({
                            title: s.username,
                            subtitle: `joined ${fmtDate(s.createdAt)}${s.accessCode ? ` · code ${s.accessCode}` : " · class link"}`,
                            progress: s.progress,
                          })
                        }
                        className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-gray-500 transition-colors hover:bg-purple-50 hover:text-purple-700"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate codes */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">Access codes</h3>
        <p className="text-sm text-gray-500 mb-4">
          Optional, for tracking individual research participants: each code is single-use and
          ties one signup to one participant. Share the <span className="font-medium">invite
          link</span> and they only pick a username and password. Enter a specific code (e.g.{" "}
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

      {/* Code list */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Codes</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {usedCount} redeemed
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
                          <ProgressChips progress={c.progress} />
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
                            onClick={() =>
                              used && c.progress && setDetail({
                                title: c.usedByUsername ?? "Participant",
                                subtitle: `code ${c.code}${c.participantLabel ? ` · ${c.participantLabel}` : ""} · joined ${fmtDate(c.usedAt)}`,
                                progress: c.progress,
                              })
                            }
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
      {detail && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-16" onClick={() => setDetail(null)}>
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold leading-tight text-gray-900">{detail.title}</h3>
                <p className="text-xs text-gray-500">{detail.subtitle}</p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto px-6 py-4">
              {detail.progress.length > 0 ? (
                <div className="space-y-4">
                  {detail.progress.map((p) => {
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
                          <div><dt className="text-gray-400">Messages sent</dt><dd className="font-medium text-gray-800">{p.messageCount}</dd></div>
                          <div><dt className="text-gray-400">Safe rate</dt><dd className="font-medium text-gray-800">{started ? `${rate ?? 0}%` : "—"}</dd></div>
                          <div><dt className="text-gray-400">Replies (P · N · V)</dt><dd className="font-medium text-gray-800">{p.protectiveCount} · {p.neutralCount} · {p.vulnerableCount}</dd></div>
                          <div><dt className="text-gray-400">Visits</dt><dd className="font-medium text-gray-800">{p.visitCount}</dd></div>
                          <div><dt className="text-gray-400">Target reached</dt><dd className="font-medium text-gray-800">{fmtDate(p.masteryReachedAt)}</dd></div>
                          <div><dt className="text-gray-400">Finished</dt><dd className="font-medium text-gray-800">{fmtDate(p.completedAt)}</dd></div>
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

// One compact chip per scenario: messages sent, safe rate, and a check once the target is met.
function ProgressChips({ progress }: { progress: Progress[] }) {
  if (progress.length === 0) return <span className="text-gray-200">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {progress.map((p, i) => {
        const started = p.visitCount > 0;
        const rate = pct(p.protectiveRate) ?? 0;
        const reached = !!p.masteryReachedAt;
        return (
          <span
            key={p.scenarioId}
            title={`${p.scenarioName} — ${started ? `${p.messageCount} messages · ${rate}% safe${reached ? " · target reached" : ""}` : "not started"}`}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
              reached
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : started
                ? "border-purple-200 bg-purple-50 text-purple-700"
                : "border-gray-200/70 bg-white text-gray-300"
            }`}
          >
            <span className="font-semibold">S{i + 1}</span>
            {started ? (
              <>
                <span className="inline-flex items-center gap-0.5 opacity-70">
                  <MessageSquare className="h-2.5 w-2.5" />{p.messageCount}
                </span>
                <span>{rate}%</span>
                {reached && <Check className="h-3 w-3" />}
              </>
            ) : (
              <span className="opacity-60">—</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
