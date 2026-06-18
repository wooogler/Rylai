// ============================================================================
// Response classification rubric (DRAFT)
// ----------------------------------------------------------------------------
// Used by the feedback agent to classify each participant reply along a
// protective ↔ vulnerable spectrum, per the RYLAI Evaluation Plan §5.2 / §6.2.
//
// This is a FIRST DRAFT, grounded in:
//   - Evaluation Plan §5.2: classify protective / neutral / risky, plus
//     recognition of grooming tactics, use of protective strategies, and
//     attainment of stage-specific learning objectives.
//   - Fine-Tuning Prompts.md feedback_stage_descriptions / goals (the per-stage
//     protective strategies the anchors below are derived from).
//
// Expected to be reviewed and replaced. Edit the text freely — the structure is
// what the rest of the system depends on.
// ============================================================================

export type ResponseLabel = 'protective' | 'neutral' | 'risky';

// High-level definition of each label (stage-independent).
export const LABEL_DEFINITIONS: Record<ResponseLabel, string> = {
  protective:
    "Resilient. The teen recognizes the tactic and/or uses a safe strategy for this stage — withholds personal/identifying info, sets or holds a boundary, refuses secrecy, questions intent, signals that a trusted adult is aware, or disengages/blocks/reports when appropriate.",
  neutral:
    "Neither clearly protective nor clearly risky. Small talk, ambiguous, or deflection that does not disclose anything risky but also does not recognize the tactic or apply a protective strategy.",
  risky:
    "Vulnerable. The teen increases exposure — shares personal/identifying info, agrees to move to a private channel, confirms being alone/unsupervised, accepts secrecy or exclusivity, complies with escalating or sexual requests, or agrees to meet offline.",
};

// Per-stage anchors: concrete examples of what protective vs risky looks like at
// each grooming stage (1-6). Derived from the feedback stage prompts.
export interface StageAnchors {
  protective: string[];
  risky: string[];
}

export const STAGE_CLASSIFICATION_ANCHORS: Record<number, StageAnchors> = {
  1: {
    protective: [
      "Keeps the conversation surface-level; does not share real name, age, school, location, or photos",
      "Declines or ignores requests for personal info or to move to another app/number",
      "Shows caution even if the person seems nice (e.g., \"I don't share that online\")",
    ],
    risky: [
      "Shares identifying details (name, age, school, location) or sends a photo",
      "Agrees to move to a private channel (Discord, Snapchat, phone number)",
      "Over-discloses early or treats the stranger as already trusted",
    ],
  },
  2: {
    protective: [
      "Limits emotional sharing and keeps interactions light/appropriate",
      "Resists flattery or gift offers; redirects or delays replies",
      "Keeps the conversation in public/group spaces or involves a friend/adult",
    ],
    risky: [
      "Accepts excessive compliments or gifts; leans into feeling 'special'",
      "Over-shares feelings or treats the stranger as a close confidant",
      "Moves to private one-on-one or emotionally intense conversation",
    ],
  },
  3: {
    protective: [
      "Does not confirm being alone or unsupervised",
      "Signals that a trusted adult is aware (e.g., \"my parents check my messages\")",
      "Questions why the person is asking, or declines to answer privacy probes",
    ],
    risky: [
      "Confirms being alone / no adults nearby",
      "Shares schedule or times when unsupervised",
      "Answers supervision/privacy probes directly",
    ],
  },
  4: {
    protective: [
      "Refuses secrecy (e.g., \"I don't keep secrets from my parents\")",
      "States discomfort and reinforces boundaries",
      "Rejects exclusivity / 'us vs. everyone else' framing",
    ],
    risky: [
      "Agrees to keep secrets or accepts an exclusive/secret relationship",
      "Tolerates inappropriate topics to 'prove trust'",
      "Accepts being made to feel uniquely understood by the stranger",
    ],
  },
  5: {
    protective: [
      "Says no firmly; refuses to send images or engage sexual topics",
      "Stops responding / disengages; states this is not okay",
      "Intends to block, save evidence, report, and tell a trusted adult",
    ],
    risky: [
      "Sends, offers, or considers sending images, or engages sexual topics",
      "Negotiates, complies, or keeps the escalation secret",
      "Blames self instead of recognizing coercion",
    ],
  },
  6: {
    protective: [
      "Refuses to meet; stops all communication; blocks the account",
      "Saves messages and reports (platform / CyberTipline); tells a trusted adult",
      "Resists threats, guilt, or blackmail rather than complying",
    ],
    risky: [
      "Agrees to or considers meeting; shares location or availability",
      "Gives in to threats/blackmail to maintain the relationship",
      "Keeps the plan secret from guardians",
    ],
  },
};

// Cross-cutting signals the classifier should also report (Evaluation Plan §5.2).
export const CLASSIFICATION_SIGNALS = {
  tacticRecognized:
    "Did the teen show awareness of what the other person is doing (the grooming tactic)?",
  protectiveStrategy:
    "Did the teen apply a protective strategy appropriate to this stage?",
} as const;

// Mastery mapping (Evaluation Plan §6.2): a "successful" response = classified
// `protective`. Stage mastery = 3 successful (protective) responses within the
// stage. `neutral` does not count toward mastery; `risky` should trigger
// corrective feedback and a retry within the stage.
export const SUCCESSFUL_LABEL: ResponseLabel = 'protective';
export const MASTERY_THRESHOLD = 3;

// Build the rubric text to embed in the feedback prompt. Stage 0 / out-of-range
// falls back to Stage 1 anchors.
export function buildClassificationRubric(stage: number | null | undefined): string {
  const s = stage && stage >= 1 && stage <= 6 ? stage : 1;
  const anchors = STAGE_CLASSIFICATION_ANCHORS[s];
  const bullet = (arr: string[]) => arr.map((a) => `  - ${a}`).join('\n');

  return `Classify the teen's most recent reply (the most recent "User" message, even if the predator has already responded after it) as exactly one of: "protective", "neutral", or "risky".

Label definitions:
- protective: ${LABEL_DEFINITIONS.protective}
- neutral: ${LABEL_DEFINITIONS.neutral}
- risky: ${LABEL_DEFINITIONS.risky}

For this stage (Stage ${s}):
Protective looks like:
${bullet(anchors.protective)}
Risky looks like:
${bullet(anchors.risky)}

Also judge two signals:
- tacticRecognized (true/false): ${CLASSIFICATION_SIGNALS.tacticRecognized}
- protectiveStrategy (true/false): ${CLASSIFICATION_SIGNALS.protectiveStrategy}`;
}
