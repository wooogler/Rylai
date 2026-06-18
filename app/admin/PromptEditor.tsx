"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { FeedbackConfig, ClassificationConfig, StageKey } from "@/lib/db/schema";
import { DEFAULT_FEEDBACK_CONFIG } from "@/lib/feedback-prompts";
import { DEFAULT_CLASSIFICATION_CONFIG, STAGE_KEYS } from "@/lib/classification-criteria";
import { GROOMING_STAGES, AGE_BRACKETS } from "../store/useScenarioStore";

// "Full" editing shapes: every field is a concrete string (prefilled with the saved
// override or the system default). The parent diffs these against the defaults on save
// to produce the sparse config that gets persisted (a field equal to its default is
// dropped, so future default changes keep propagating).
export type FeedbackEdit = {
  persona: string;
  instruction: string;
  stages: Record<StageKey, { description: string; goal: string }>;
};
export type ClassificationEdit = {
  labelDefinitions: { protective: string; neutral: string; vulnerable: string };
  signals: { tacticRecognized: string; protectiveStrategy: string };
  stages: Record<StageKey, { protective: string; vulnerable: string }>;
};

// ---- init (config → full edit object) ----------------------------------------

export function toFeedbackEdit(cfg: FeedbackConfig | null): FeedbackEdit {
  const d = DEFAULT_FEEDBACK_CONFIG;
  return {
    persona: cfg?.persona ?? d.persona,
    instruction: cfg?.instruction ?? d.instruction,
    stages: Object.fromEntries(
      STAGE_KEYS.map((s) => [
        s,
        {
          description: cfg?.stages?.[s]?.description ?? d.stages[s].description,
          goal: cfg?.stages?.[s]?.goal ?? d.stages[s].goal,
        },
      ])
    ) as FeedbackEdit["stages"],
  };
}

export function toClassificationEdit(cfg: ClassificationConfig | null): ClassificationEdit {
  const d = DEFAULT_CLASSIFICATION_CONFIG;
  return {
    labelDefinitions: {
      protective: cfg?.labelDefinitions?.protective ?? d.labelDefinitions.protective,
      neutral: cfg?.labelDefinitions?.neutral ?? d.labelDefinitions.neutral,
      vulnerable: cfg?.labelDefinitions?.vulnerable ?? d.labelDefinitions.vulnerable,
    },
    signals: {
      tacticRecognized: cfg?.signals?.tacticRecognized ?? d.signals.tacticRecognized,
      protectiveStrategy: cfg?.signals?.protectiveStrategy ?? d.signals.protectiveStrategy,
    },
    stages: Object.fromEntries(
      STAGE_KEYS.map((s) => [
        s,
        {
          protective: cfg?.stages?.[s]?.protective ?? d.stages[s].protective,
          vulnerable: cfg?.stages?.[s]?.vulnerable ?? d.stages[s].vulnerable,
        },
      ])
    ) as ClassificationEdit["stages"],
  };
}

// ---- diff (full edit object → sparse config to persist) ----------------------

const differs = (a: string, b: string) => a.trim() !== b.trim();

export function fromFeedbackEdit(edit: FeedbackEdit): FeedbackConfig | null {
  const d = DEFAULT_FEEDBACK_CONFIG;
  const out: FeedbackConfig = {};
  if (differs(edit.persona, d.persona)) out.persona = edit.persona;
  if (differs(edit.instruction, d.instruction)) out.instruction = edit.instruction;
  const stages: NonNullable<FeedbackConfig["stages"]> = {};
  for (const s of STAGE_KEYS) {
    const stage: { description?: string; goal?: string } = {};
    if (differs(edit.stages[s].description, d.stages[s].description))
      stage.description = edit.stages[s].description;
    if (differs(edit.stages[s].goal, d.stages[s].goal)) stage.goal = edit.stages[s].goal;
    if (Object.keys(stage).length > 0) stages[s] = stage;
  }
  if (Object.keys(stages).length > 0) out.stages = stages;
  return Object.keys(out).length > 0 ? out : null;
}

export function fromClassificationEdit(edit: ClassificationEdit): ClassificationConfig | null {
  const d = DEFAULT_CLASSIFICATION_CONFIG;
  const out: ClassificationConfig = {};
  const labels: NonNullable<ClassificationConfig["labelDefinitions"]> = {};
  if (differs(edit.labelDefinitions.protective, d.labelDefinitions.protective))
    labels.protective = edit.labelDefinitions.protective;
  if (differs(edit.labelDefinitions.neutral, d.labelDefinitions.neutral))
    labels.neutral = edit.labelDefinitions.neutral;
  if (differs(edit.labelDefinitions.vulnerable, d.labelDefinitions.vulnerable))
    labels.vulnerable = edit.labelDefinitions.vulnerable;
  if (Object.keys(labels).length > 0) out.labelDefinitions = labels;

  const signals: NonNullable<ClassificationConfig["signals"]> = {};
  if (differs(edit.signals.tacticRecognized, d.signals.tacticRecognized))
    signals.tacticRecognized = edit.signals.tacticRecognized;
  if (differs(edit.signals.protectiveStrategy, d.signals.protectiveStrategy))
    signals.protectiveStrategy = edit.signals.protectiveStrategy;
  if (Object.keys(signals).length > 0) out.signals = signals;

  const stages: NonNullable<ClassificationConfig["stages"]> = {};
  for (const s of STAGE_KEYS) {
    const stage: { protective?: string; vulnerable?: string } = {};
    if (differs(edit.stages[s].protective, d.stages[s].protective))
      stage.protective = edit.stages[s].protective;
    if (differs(edit.stages[s].vulnerable, d.stages[s].vulnerable)) stage.vulnerable = edit.stages[s].vulnerable;
    if (Object.keys(stage).length > 0) stages[s] = stage;
  }
  if (Object.keys(stages).length > 0) out.stages = stages;
  return Object.keys(out).length > 0 ? out : null;
}

// ---- field ------------------------------------------------------------------

function Field({
  label,
  hint,
  value,
  defaultValue,
  onChange,
  rows = 4,
}: {
  label: string;
  hint?: string;
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const isDefault = value.trim() === defaultValue.trim();
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          disabled={isDefault}
          className={`flex items-center gap-1 text-xs ${
            isDefault
              ? "text-gray-300 cursor-default"
              : "text-purple-600 hover:text-purple-800"
          }`}
          title="Revert this field to the system default"
        >
          <RotateCcw className="w-3 h-3" />
          {isDefault ? "Default" : "Revert to default"}
        </button>
      </div>
      {hint && <p className="text-xs text-gray-500 mb-1.5">{hint}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono leading-relaxed"
      />
    </div>
  );
}

function stageLabel(s: StageKey): string {
  const info = GROOMING_STAGES.find((g) => g.stage === s);
  return info ? `Stage ${s}: ${info.name}` : `Stage ${s}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{children}</p>;
}

// ---- main editor ------------------------------------------------------------

export default function PromptEditor({
  feedback,
  classification,
  age,
  onFeedbackChange,
  onClassificationChange,
  onAgeChange,
}: {
  feedback: FeedbackEdit;
  classification: ClassificationEdit;
  age: number | null;
  onFeedbackChange: (next: FeedbackEdit) => void;
  onClassificationChange: (next: ClassificationEdit) => void;
  onAgeChange: (next: number | null) => void;
}) {
  const [stage, setStage] = useState<StageKey>(1);

  const df = DEFAULT_FEEDBACK_CONFIG;
  const dc = DEFAULT_CLASSIFICATION_CONFIG;

  return (
    <div className="space-y-8">
      {/* Learner age group — affects the prompt (the age line + sensitive-content tone). */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <label className="block text-lg font-semibold mb-1">Learner Age Group</label>
        <p className="text-sm text-gray-600 mb-3">
          Applies to all of your scenarios. It scales how the online stranger (the chat
          simulation) handles sensitive (Stage 5) content. It does not change the feedback
          prompt.
        </p>
        <select
          value={age === null ? "" : String(age)}
          onChange={(e) => onAgeChange(e.target.value === "" ? null : parseInt(e.target.value))}
          className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">Not set (use system default)</option>
          {AGE_BRACKETS.map((b) => (
            <option key={b.value} value={b.value}>
              Ages {b.label}
            </option>
          ))}
        </select>
      </div>

      {/* Global fields (all stages) */}
      <div className="bg-white rounded-lg shadow-md p-6 space-y-5">
        <h3 className="text-lg font-semibold text-gray-800">Global (applies to all stages)</h3>

        <div className="space-y-4">
          <SectionTitle>Feedback</SectionTitle>
          <Field
            label="Assistant persona / role"
            hint="The framing sent at the top of every feedback prompt (all stages)."
            value={feedback.persona}
            defaultValue={df.persona}
            onChange={(v) => onFeedbackChange({ ...feedback, persona: v })}
            rows={4}
          />
          <Field
            label="Feedback style & format"
            hint="How the teen-facing feedback should be written (length, tone, structure)."
            value={feedback.instruction}
            defaultValue={df.instruction}
            onChange={(v) => onFeedbackChange({ ...feedback, instruction: v })}
            rows={6}
          />
        </div>

        <div className="space-y-4 pt-2 border-t border-gray-100">
          <SectionTitle>Classification</SectionTitle>
          <Field
            label="Label definition — Protective"
            value={classification.labelDefinitions.protective}
            defaultValue={dc.labelDefinitions.protective}
            onChange={(v) =>
              onClassificationChange({
                ...classification,
                labelDefinitions: { ...classification.labelDefinitions, protective: v },
              })
            }
            rows={3}
          />
          <Field
            label="Label definition — Neutral"
            value={classification.labelDefinitions.neutral}
            defaultValue={dc.labelDefinitions.neutral}
            onChange={(v) =>
              onClassificationChange({
                ...classification,
                labelDefinitions: { ...classification.labelDefinitions, neutral: v },
              })
            }
            rows={3}
          />
          <Field
            label="Label definition — Vulnerable"
            value={classification.labelDefinitions.vulnerable}
            defaultValue={dc.labelDefinitions.vulnerable}
            onChange={(v) =>
              onClassificationChange({
                ...classification,
                labelDefinitions: { ...classification.labelDefinitions, vulnerable: v },
              })
            }
            rows={3}
          />
          <Field
            label="Signal — tacticRecognized"
            hint="Question the classifier answers true/false."
            value={classification.signals.tacticRecognized}
            defaultValue={dc.signals.tacticRecognized}
            onChange={(v) =>
              onClassificationChange({
                ...classification,
                signals: { ...classification.signals, tacticRecognized: v },
              })
            }
            rows={2}
          />
          <Field
            label="Signal — protectiveStrategy"
            hint="Question the classifier answers true/false."
            value={classification.signals.protectiveStrategy}
            defaultValue={dc.signals.protectiveStrategy}
            onChange={(v) =>
              onClassificationChange({
                ...classification,
                signals: { ...classification.signals, protectiveStrategy: v },
              })
            }
            rows={2}
          />
        </div>
      </div>

      {/* Per-stage fields */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="text-lg font-semibold text-gray-800 mr-1">Per stage</span>
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

        <div className="space-y-4">
          <SectionTitle>Feedback</SectionTitle>
          <Field
            label="Stage description"
            value={feedback.stages[stage].description}
            defaultValue={df.stages[stage].description}
            onChange={(v) =>
              onFeedbackChange({
                ...feedback,
                stages: { ...feedback.stages, [stage]: { ...feedback.stages[stage], description: v } },
              })
            }
            rows={6}
          />
          <Field
            label="Guidance goal"
            value={feedback.stages[stage].goal}
            defaultValue={df.stages[stage].goal}
            onChange={(v) =>
              onFeedbackChange({
                ...feedback,
                stages: { ...feedback.stages, [stage]: { ...feedback.stages[stage], goal: v } },
              })
            }
            rows={3}
          />
        </div>

        <div className="space-y-4 pt-4 mt-4 border-t border-gray-100">
          <SectionTitle>Classification</SectionTitle>
          <Field
            label="Protective anchors"
            hint="One example per line — rendered as a bullet list in the prompt."
            value={classification.stages[stage].protective}
            defaultValue={dc.stages[stage].protective}
            onChange={(v) =>
              onClassificationChange({
                ...classification,
                stages: {
                  ...classification.stages,
                  [stage]: { ...classification.stages[stage], protective: v },
                },
              })
            }
            rows={4}
          />
          <Field
            label="Vulnerable anchors"
            hint="One example per line — rendered as a bullet list in the prompt."
            value={classification.stages[stage].vulnerable}
            defaultValue={dc.stages[stage].vulnerable}
            onChange={(v) =>
              onClassificationChange({
                ...classification,
                stages: {
                  ...classification.stages,
                  [stage]: { ...classification.stages[stage], vulnerable: v },
                },
              })
            }
            rows={4}
          />
        </div>
      </div>
    </div>
  );
}
