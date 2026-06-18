// ============================================================================
// Response classification rubric
// ----------------------------------------------------------------------------
// Used by the feedback agent to classify each participant reply along a
// protective <-> vulnerable spectrum, and to tag it with a finer-grained response
// type from the paper's stage-based taxonomy.
//
// Grounded in:
//   Zhang et al., "From Vulnerable to Resilient: Examining Parent and Teen
//   Perceptions on How to Respond to Unwanted Cybergrooming Advances," CHI '26.
//   - Four protective strategies (Table 4): setting boundaries, directly
//     declining, signaling risk awareness, leveraging avoidance.
//   - Four vulnerable behaviors (Table 3): encouraging risk escalation, accepting
//     an advance, displaying vulnerability, negating risk concern.
//   - Stage-by-stage mapping (Table 7), used for the per-stage anchors below.
//
// Terminology note: following the paper, the other party is referred to as the
// "online stranger" (not "predator"/"perpetrator") to avoid the stranger-danger
// myth — the person can seem friendly and not obviously dangerous.
//
// Educators may override the label definitions, signals, and per-stage anchors
// (see lib/db/schema.ts ClassificationConfig). The response-type taxonomy itself is
// fixed (structural). Edit the text freely — the structure is what the rest of the
// system depends on.
// ============================================================================

import type { ClassificationConfig, ResponseType, StageKey } from './db/schema';

export type ResponseLabel = 'protective' | 'neutral' | 'vulnerable';

// High-level definition of each label (stage-independent).
export const LABEL_DEFINITIONS: Record<ResponseLabel, string> = {
  protective:
    "Resilient. The teen applies a protective strategy for this stage — sets or holds a boundary, directly declines (says no / ends / blocks), signals risk awareness (an adult is aware, names the risk, shows suspicion), or leverages avoidance (deflects, redirects, delays).",
  neutral:
    "Neither clearly protective nor clearly vulnerable. Small talk or an ambiguous reply that discloses nothing risky but also does not apply a protective strategy or recognize what the online stranger is doing.",
  vulnerable:
    "The teen increases exposure — encourages escalation (reciprocates interest, probes, moves toward a meetup or sexual talk), accepts an advance (shares personal info/photos), displays vulnerability (confirms being alone, hesitates, shows emotional neediness), or negates risk concern (promises secrecy, downplays the danger).",
};

// Per-stage anchors: concrete examples of what protective vs vulnerable replies look
// like at each grooming stage (1-6). Derived from the paper's stage mapping (Table 7)
// and theme tables (Tables 3 and 4).
export interface StageAnchors {
  protective: string[];
  vulnerable: string[];
}

export const STAGE_CLASSIFICATION_ANCHORS: Record<number, StageAnchors> = {
  // Stage 1 — Friendship Forming
  1: {
    protective: [
      "Keeps it appropriate: steers to safe topics or states a personal rule (e.g., \"I only chat here to talk about games\")",
      "Refuses to share personal info (real name, age, school, location, phone number, photos)",
      "Stays on the current platform instead of moving to phone/SMS or another app",
    ],
    vulnerable: [
      "Shares personal information such as a phone number or other identifying details",
      "Reciprocates friendliness quickly — eager compliments or enthusiasm that signal openness",
      "Volunteers unnecessary personal details or sends a photo",
    ],
  },
  // Stage 2 — Relationship Forming
  2: {
    protective: [
      "Sets a clear boundary (e.g., \"I'm just here for friends\")",
      "Emphasizes the relationship is too new to share personal or family details",
      "Redirects to a neutral topic or answers a question with a question",
    ],
    vulnerable: [
      "Shares family details (who is at home, family relationships)",
      "Expresses emotional neediness or loneliness",
      "Probes with personal questions or openly answers the stranger's personal questions",
    ],
  },
  // Stage 3 — Risk Assessment
  3: {
    protective: [
      "Signals risk awareness — names that the behavior is wrong or illegal",
      "Indicates an adult is aware (e.g., \"my mom checks my phone\")",
      "Expresses suspicion or distrust (\"most people online aren't who they say they are\")",
    ],
    vulnerable: [
      "Negates risk concern — promises to keep it secret or that \"no one will know\"",
      "Reassures the stranger there is nothing to worry about / downplays consequences",
      "Confirms being alone or unsupervised",
    ],
  },
  // Stage 4 — Exclusivity
  4: {
    protective: [
      "States discomfort with the closeness or secrecy (\"I'm not comfortable with this\")",
      "Reaffirms personal boundaries; rejects being framed as \"special\" or exclusive",
      "Shifts to a safe, non-intimate topic",
    ],
    vulnerable: [
      "Reciprocates flattery; leans into being made to feel special (\"you're so sweet, unlike the others\")",
      "Shows emotional vulnerability or seeks validation and special attention",
      "Accepts exclusivity or secrecy to deepen the bond",
    ],
  },
  // Stage 5 — Sexual
  5: {
    protective: [
      "Directly refuses sexual content or image requests (a firm \"no\")",
      "Ends the conversation or blocks the stranger",
      "Uses avoidance such as shifting the topic or a non-committal deflection",
    ],
    vulnerable: [
      "Sends, offers, or conditionally agrees to send sensitive/sexual images",
      "Engages in sexual conversation",
      "Expresses curiosity or willingness to please the stranger (or blames self instead of recognizing coercion)",
    ],
  },
  // Stage 6 — Conclusion (offline meetup)
  6: {
    protective: [
      "Explicitly refuses the offline meetup",
      "Ends the conversation or blocks the person",
      "Insists on staying online-only",
    ],
    vulnerable: [
      "Agrees to or considers meeting offline",
      "Suggests or encourages a future meetup, or shares logistics",
      "Gives availability or location (e.g., \"I'll be alone Saturday\")",
    ],
  },
};

// The paper's response-type taxonomy (Tables 3 & 4). Four protective strategies and
// four vulnerable behaviors; 'none' is used for neutral / unclear replies. This is a
// fixed structural list (not educator-editable).
export const RESPONSE_TYPE_DEFINITIONS: Record<Exclude<ResponseType, 'none'>, string> = {
  // Protective strategies
  setting_boundaries:
    "Setting boundaries — keeping the topic appropriate, expressing discomfort, engaging only under a firm condition, staying in a safe space, or noting the relationship is too new.",
  directly_declining:
    "Directly declining an advance — saying no, ending or leaving the conversation, blocking, or giving a warning.",
  signaling_risk_awareness:
    "Signaling risk awareness — indicating an adult is aware, affirming the behavior is risky/illegal, or expressing suspicion or distrust.",
  leveraging_avoidance:
    "Leveraging avoidance — answering with a question, redirecting the topic, delaying a direct answer, or giving vague/false info to deflect.",
  // Vulnerable behaviors
  encouraging_escalation:
    "Encouraging risk escalation — reciprocating interest or flirtation, probing questions, facilitating an offline meetup, or engaging in sexual conversation.",
  accepting_advance:
    "Accepting an advance — sharing personal information or photos, or conditionally agreeing to share more.",
  displaying_vulnerability:
    "Displaying vulnerability — confirming being unsupervised, expressing uncertainty/hesitation, or showing emotional neediness.",
  negating_risk_concern:
    "Negating risk concern — promising secrecy or reassuring the stranger that there is nothing to worry about.",
};

const PROTECTIVE_TYPES: ResponseType[] = [
  'setting_boundaries',
  'directly_declining',
  'signaling_risk_awareness',
  'leveraging_avoidance',
];
const VULNERABLE_TYPES: ResponseType[] = [
  'encouraging_escalation',
  'accepting_advance',
  'displaying_vulnerability',
  'negating_risk_concern',
];

// Cross-cutting signals the classifier should also report.
export const CLASSIFICATION_SIGNALS = {
  tacticRecognized:
    "Did the teen show awareness of what the online stranger is doing (their grooming tactic)?",
  protectiveStrategy:
    "Did the teen apply a protective strategy appropriate to this stage?",
} as const;

// Mastery mapping: a "successful" response = classified `protective`. Stage mastery =
// 3 successful (protective) responses within the stage. `neutral` does not count;
// `vulnerable` should trigger corrective feedback and a retry within the stage.
export const SUCCESSFUL_LABEL: ResponseLabel = 'protective';
export const MASTERY_THRESHOLD = 3;

export const STAGE_KEYS: StageKey[] = [1, 2, 3, 4, 5, 6];

// Fully-populated variant (every field present) for the system default.
export type FullClassificationConfig = {
  labelDefinitions: { protective: string; neutral: string; vulnerable: string };
  signals: { tacticRecognized: string; protectiveStrategy: string };
  stages: Record<StageKey, { protective: string; vulnerable: string }>;
};

// The fully-populated system default config, exposed so the admin UI can prefill
// the editor textareas and offer a "revert to default" for each field. Anchor lists
// are joined into newline-separated strings (the format the editor + builder use).
export const DEFAULT_CLASSIFICATION_CONFIG: FullClassificationConfig = {
  labelDefinitions: { ...LABEL_DEFINITIONS },
  signals: {
    tacticRecognized: CLASSIFICATION_SIGNALS.tacticRecognized,
    protectiveStrategy: CLASSIFICATION_SIGNALS.protectiveStrategy,
  },
  stages: Object.fromEntries(
    STAGE_KEYS.map((s) => [
      s,
      {
        protective: STAGE_CLASSIFICATION_ANCHORS[s].protective.join('\n'),
        vulnerable: STAGE_CLASSIFICATION_ANCHORS[s].vulnerable.join('\n'),
      },
    ])
  ) as FullClassificationConfig['stages'],
};

// Trimmed override if non-empty, else the system default.
const pick = (override: string | undefined, fallback: string): string => {
  const t = override?.trim();
  return t ? t : fallback;
};

// Render a newline-separated anchor string as a bullet list (drops blank lines and
// any leading "- "/"* " the educator may have typed).
const bulletText = (text: string): string =>
  text
    .split('\n')
    .map((l) => l.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean)
    .map((l) => `  - ${l}`)
    .join('\n');

// Build the rubric text to embed in the feedback prompt. Stage 0 / out-of-range
// falls back to Stage 1 anchors. `cfg` (per-educator overrides) replaces any field
// it specifies; everything else uses the system default.
export function buildClassificationRubric(
  stage: number | null | undefined,
  cfg?: ClassificationConfig | null
): string {
  const s = (stage && stage >= 1 && stage <= 6 ? stage : 1) as StageKey;
  const stageCfg = cfg?.stages?.[s];

  const protectiveDef = pick(cfg?.labelDefinitions?.protective, LABEL_DEFINITIONS.protective);
  const neutralDef = pick(cfg?.labelDefinitions?.neutral, LABEL_DEFINITIONS.neutral);
  const vulnerableDef = pick(cfg?.labelDefinitions?.vulnerable, LABEL_DEFINITIONS.vulnerable);

  const protectiveAnchors = bulletText(
    pick(stageCfg?.protective, DEFAULT_CLASSIFICATION_CONFIG.stages[s].protective)
  );
  const vulnerableAnchors = bulletText(
    pick(stageCfg?.vulnerable, DEFAULT_CLASSIFICATION_CONFIG.stages[s].vulnerable)
  );

  const tacticSignal = pick(cfg?.signals?.tacticRecognized, CLASSIFICATION_SIGNALS.tacticRecognized);
  const protectiveSignal = pick(
    cfg?.signals?.protectiveStrategy,
    CLASSIFICATION_SIGNALS.protectiveStrategy
  );

  const typeDefs = (Object.keys(RESPONSE_TYPE_DEFINITIONS) as Array<Exclude<ResponseType, 'none'>>)
    .map((t) => `  - ${t}: ${RESPONSE_TYPE_DEFINITIONS[t]}`)
    .join('\n');

  return `Classify the teen's most recent reply (the most recent "User" message, even if the online stranger has already responded after it) as exactly one of: "protective", "neutral", or "vulnerable".

Label definitions:
- protective: ${protectiveDef}
- neutral: ${neutralDef}
- vulnerable: ${vulnerableDef}

For this stage (Stage ${s}):
Protective looks like:
${protectiveAnchors}
Vulnerable looks like:
${vulnerableAnchors}

Also choose the single best "responseType" for the teen's most recent reply:
- If "protective", choose one of: ${PROTECTIVE_TYPES.join(', ')}.
- If "vulnerable", choose one of: ${VULNERABLE_TYPES.join(', ')}.
- If "neutral", use "none".
Response type definitions:
${typeDefs}

Also judge two signals:
- tacticRecognized (true/false): ${tacticSignal}
- protectiveStrategy (true/false): ${protectiveSignal}`;
}
