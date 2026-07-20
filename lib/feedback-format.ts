// Shared wire format for structured (3-part) feedback (Evaluation Plan §6.2, L234–240).
// The feedback model returns three short fields; the server packs the educator-enabled ones
// (respecting the display mode) into a JSON string stored in user_feedbacks.feedbackText and
// returned to the client. The client parses it and renders collective or tabbed. Legacy
// single-string feedback (pre-P4) parses as { kind: 'legacy' } and renders as plain markdown.

export const FEEDBACK_PART_KEYS = ['yourResponse', 'stageIntent', 'nextMove'] as const;
export type FeedbackPartKey = (typeof FEEDBACK_PART_KEYS)[number];

export const FEEDBACK_PART_LABELS: Record<FeedbackPartKey, string> = {
  yourResponse: 'Your Response',
  stageIntent: 'Stage & Intention',
  nextMove: 'How to Respond Next',
};

// Short labels for the tabbed display, where the full labels wrap in the narrow comment card.
export const FEEDBACK_TAB_LABELS: Record<FeedbackPartKey, string> = {
  yourResponse: 'Your reply',
  stageIntent: 'Their tactic',
  nextMove: 'Next step',
};

export type FeedbackDisplayMode = 'collective' | 'tabs';

export interface FeedbackParts {
  yourResponse: string;
  stageIntent: string;
  nextMove: string;
}

// Educator display config (stored on users.feedbackConfig): which parts to show and how.
export interface FeedbackDisplayConfig {
  parts?: Partial<Record<FeedbackPartKey, boolean>>;
  displayMode?: FeedbackDisplayMode;
}

interface PackedPart {
  key: FeedbackPartKey;
  label: string;
  text: string;
}

// Server-side: pack the model's three parts into the wire string, dropping parts the educator
// disabled or the model left empty. A part is enabled unless explicitly set to false.
export function packFeedback(parts: FeedbackParts, cfg?: FeedbackDisplayConfig | null): string {
  const mode: FeedbackDisplayMode = cfg?.displayMode === 'tabs' ? 'tabs' : 'collective';
  const out: PackedPart[] = FEEDBACK_PART_KEYS
    .filter((k) => cfg?.parts?.[k] !== false)
    .map((k) => ({ key: k, label: FEEDBACK_PART_LABELS[k], text: (parts[k] ?? '').trim() }))
    .filter((p) => p.text.length > 0);
  return JSON.stringify({ v: 2, mode, parts: out });
}

export type ParsedFeedback =
  | { kind: 'v2'; mode: FeedbackDisplayMode; parts: PackedPart[] }
  | { kind: 'legacy'; text: string };

// Client-side: parse a stored/returned feedback string. Returns the structured parts for the
// v2 format, or the raw string as legacy markdown.
export function parseFeedback(text: string): ParsedFeedback {
  if (text && text.trimStart().startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      if (obj && obj.v === 2 && Array.isArray(obj.parts)) {
        return {
          kind: 'v2',
          mode: obj.mode === 'tabs' ? 'tabs' : 'collective',
          parts: (obj.parts as PackedPart[]).filter((p) => p && typeof p.text === 'string'),
        };
      }
    } catch {
      // fall through to legacy
    }
  }
  return { kind: 'legacy', text };
}

// A short plain-text summary (used for collapsed cards): the first part's text, or the raw
// legacy text.
export function feedbackSummary(text: string): string {
  const parsed = parseFeedback(text);
  if (parsed.kind === 'v2') return parsed.parts[0]?.text ?? '';
  return parsed.text;
}
