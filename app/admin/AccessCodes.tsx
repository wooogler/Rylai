"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Copy, Check } from "lucide-react";

interface AccessCode {
  id: string;
  code: string;
  participantLabel: string;
  usedByUserId: string | null;
  usedAt: number | null;
  createdAt: number;
}

// Participant access-code management (Evaluation Plan §6, L101–102). Educators issue codes
// here; learners must present an unused code to sign up, which then consumes it.
export default function AccessCodes({ educatorId }: { educatorId: string }) {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [label, setLabel] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [count, setCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

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
      setCodes(d.codes || []);
      setCustomCode("");
      setLabel("");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/access-codes?id=${id}&educatorId=${educatorId}`, { method: "DELETE" });
    load();
  };

  const copy = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1200);
  };

  const unused = codes.filter((c) => !c.usedByUserId).length;

  return (
    <div className="space-y-6">
      {/* Generate */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">Create access codes</h3>
        <p className="text-sm text-gray-500 mb-4">
          Participants need one of these codes to sign up. Enter a specific code (e.g.{" "}
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800">Codes</h3>
          <span className="text-sm text-gray-500">{unused} unused · {codes.length} total</span>
        </div>
        {codes.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No access codes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Label</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50">
                    <td className="py-2 pr-4">
                      <button
                        onClick={() => copy(c.code)}
                        className="inline-flex items-center gap-1.5 font-mono text-gray-800 hover:text-purple-700"
                        title="Copy code"
                      >
                        {c.code}
                        {copied === c.code ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-gray-300" />}
                      </button>
                    </td>
                    <td className="py-2 pr-4 text-gray-600">{c.participantLabel || "—"}</td>
                    <td className="py-2 pr-4">
                      {c.usedByUserId ? (
                        <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Used</span>
                      ) : (
                        <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Unused</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <button
                        onClick={() => remove(c.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Delete code"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
