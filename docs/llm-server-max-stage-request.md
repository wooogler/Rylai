# Feature Request: `max_stage` parameter for the StagePilot session API

**Audience:** Maintainers of the StagePilot / VT Custom LLM service at
`https://rylai.cs.vt.edu/llm`
**Requested by:** RYLAI application team
**Status:** Proposed
**Priority:** High (safety / content-bounding feature)

---

## 1. Summary

We would like to add an **optional upper bound on the grooming stage** that the
predator model is allowed to reach within a session.

Concretely: a new optional integer field **`max_stage`** on the session-creation
endpoint (and, ideally, honored on the per-turn endpoint as well). When set, the
server must guarantee that **the predicted stage never exceeds `max_stage`** and
that **the generated `predator_response` never contains content corresponding to a
stage above `max_stage`** — even when `auto_stage` is enabled and even if the
learner's messages would otherwise push the conversation higher.

When `max_stage` is omitted/null, behavior must be **identical to today** (no
regression).

## 2. Motivation

RYLAI is an educational anti-grooming training tool for teens. Educators author
"scenarios" and can already choose:

- a **starting stage** (`stage`), and
- whether the model **auto-advances** the stage (`auto_stage`).

The missing control is a **ceiling**. An educator running a Stage 1–2 friendship
scenario for younger learners needs a hard guarantee that the conversation will
**never** escalate into Stage 5 (sexual) or Stage 6 (offline-meeting) content,
regardless of what the learner types.

Today there is no clean way to do this:

- `auto_stage: true` lets the model move freely up to Stage 6.
- We can approximate a cap **client-side** by pinning the stage via the existing
  per-turn `stage` override once a prediction reaches the ceiling — but RYLAI only
  learns the predicted stage *after* the response is generated, so a single turn
  can overshoot the cap (e.g. a 3→5 jump produces one Stage-5 response before we
  can pin it back). For sensitive top stages, "one turn of leaked content" is not
  acceptable.

A server-side `max_stage` is the only way to get a **hard, no-overshoot cap** while
still letting the model move naturally *below* the ceiling. It also lets the model
generate genuinely stage-appropriate content at the cap, rather than being
force-pinned by an external override.

## 3. Stage taxonomy (for reference)

Stages are integers `0–6`:

| Stage | Name                  | Meaning |
|-------|-----------------------|---------|
| 0     | Free Interaction      | No stage constraints; natural conversation |
| 1     | Friendship Forming    | Rapport; asks for name/age/location/picture |
| 2     | Relationship Forming  | Hobbies, school life, daily life |
| 3     | Risk Assessment       | Checks whether others (parents/friends) are watching |
| 4     | Exclusivity           | Affection, compliments, secrecy |
| 5     | Sexual                | Introduces sexual topics / requests explicit content |
| 6     | Conclusion            | Plans an in-person meeting / off-platform contact |

## 4. Current API contract (as integrated by RYLAI today)

Documented here so the requested change can be scoped precisely. If this differs
from your current implementation, please tell us and we'll align.

### 4.1 Create session — `POST /sessions`

Request body:

```jsonc
{
  "initial_history": [
    { "speaker": "PRED" | "USER", "text": "..." }
  ],
  "age": 13,            // integer | null  (learner persona age)
  "pred_name": "Alex",  // string | null   (predator display name)
  "auto_stage": true,   // boolean         (true = model predicts stage each turn)
  "stage": 1            // integer 0–6     (starting stage; pinned when auto_stage=false)
}
```

Response body:

```jsonc
{ "session_id": "..." }
```

### 4.2 Take a turn — `POST /sessions/{session_id}/turn`

Request body:

```jsonc
{
  "victim_message": "hi!",
  "stage": null         // integer 0–6 | null  (per-turn override; null = let model decide)
}
```

Response body:

```jsonc
{
  "predator_response": "...",
  "stage": 1,                    // integer 0–6  (stage of THIS response)
  "stage_label": "Friendship Forming"
}
```

**Observed behavior we rely on:**
- `auto_stage: true` + per-turn `stage: <n>` ⇒ the response is forced to stage `n`
  for that turn; subsequent `stage: null` turns resume free prediction.
- `auto_stage: false` ⇒ the session is pinned to the creation-time `stage`.

## 5. Requested change

### 5.1 New field: `max_stage`

Add an **optional** integer field `max_stage` (range `0–6`) to **`POST /sessions`**.

```jsonc
{
  "initial_history": [ /* ... */ ],
  "age": 13,
  "pred_name": "Alex",
  "auto_stage": true,
  "stage": 1,
  "max_stage": 3        // NEW — optional. Hard ceiling on the grooming stage.
}
```

### 5.2 Required semantics

For the lifetime of a session created with `max_stage = M`:

1. **Prediction clamp.** When `auto_stage: true`, the model's per-turn stage
   prediction MUST be clamped to `≤ M`. The `stage` value returned in any turn
   response MUST always satisfy `stage ≤ M`.

2. **Content clamp (the important part).** The generated `predator_response` MUST
   NOT contain behavior/content characteristic of any stage `> M`. The cap is a
   behavioral guarantee, not just a label clamp. In particular:
   - The predator must **hold at or below stage `M`** even if the learner's
     messages explicitly invite escalation past `M`.
   - The model should respond in a way consistent with the capped stage (e.g.
     deflect/stay-in-character at stage `M`) rather than producing higher-stage
     content with a relabeled stage number.

3. **Free movement below the cap.** The model may still move **up to** and
   **down** within `[0, M]` as the conversation develops. `max_stage` only bounds
   the top; it is not a fixed stage.

4. **Interaction with the starting `stage`.** `stage` (starting/fixed) is expected
   to satisfy `stage ≤ max_stage`. RYLAI will enforce this in its UI, but the
   server should also handle a bad combination gracefully — see §5.4.

5. **Interaction with the per-turn `stage` override.** If a turn supplies an
   explicit `stage` override greater than `M`, the server MUST clamp it to `M`
   (preferred) — i.e. `effective = min(override, M)`. (Rejecting with `400` is an
   acceptable alternative if clamping is hard, but clamping is preferred so RYLAI
   never has to special-case this.)

6. **`auto_stage: false`.** When the stage is fixed, `max_stage` is effectively
   redundant. If both are sent and `stage > max_stage`, treat as the bad-combo case
   in §5.4. Otherwise `max_stage` may be ignored for fixed sessions.

### 5.3 Backward compatibility (hard requirement)

- If `max_stage` is **omitted or `null`**, behavior MUST be byte-for-byte identical
  to today (equivalent to `max_stage = 6`). Existing RYLAI sessions send no such
  field and must be unaffected.

### 5.4 Validation & error handling

- `max_stage` must be an integer in `[0, 6]`. Out-of-range or wrong-type ⇒ `400`
  with a descriptive error.
- Bad combination (`stage > max_stage` with `auto_stage: false`, or a starting
  `stage > max_stage`): preferred behavior is to **clamp the starting stage down to
  `max_stage`** and proceed; returning `400` is acceptable. Please document which
  you choose.

### 5.5 (Optional) honor `max_stage` on the turn endpoint

RYLAI persists and reuses a `session_id` across turns, and recreates the session
from history if it expires. If a session-level `max_stage` is sufficient, that's
fine — RYLAI will create a fresh session when an educator changes the cap.

If it's cheap on your side, also accepting an optional `max_stage` on
`POST /sessions/{id}/turn` (overriding the session value from that turn onward)
would let us change the cap mid-session without re-seeding. **Nice-to-have, not
required.**

### 5.6 (Optional) response signal when a prediction was capped

Purely optional and additive: a boolean like `"stage_capped": true` in the turn
response when the model *would have* predicted a higher stage but was clamped to
`M`. RYLAI could use this to surface a subtle UI cue ("the stranger tried to
escalate but was held back"). Omit if it complicates your implementation.

## 6. Worked examples

### 6.1 Capped auto session

Create:

```jsonc
POST /sessions
{ "auto_stage": true, "stage": 1, "max_stage": 3, "age": 13, "pred_name": "Alex",
  "initial_history": [] }
```

Turns (learner aggressively tries to escalate):

```jsonc
// turn 1
→ { "victim_message": "hey", "stage": null }
← { "predator_response": "...", "stage": 1, "stage_label": "Friendship Forming" }

// turn 5 — learner sends sexual content
→ { "victim_message": "<explicit>", "stage": null }
← { "predator_response": "<stays at stage 3 or below; does NOT escalate>",
    "stage": 3, "stage_label": "Risk Assessment" }   // never returns 4/5/6
```

### 6.2 Per-turn override above the cap is clamped

```jsonc
POST /sessions { "auto_stage": true, "stage": 1, "max_stage": 2, ... }
POST /sessions/{id}/turn { "victim_message": "...", "stage": 5 }
← stage in response MUST be ≤ 2 (override clamped to 2)
```

### 6.3 No `max_stage` ⇒ unchanged

```jsonc
POST /sessions { "auto_stage": true, "stage": 1, "age": 13, "pred_name": "Alex",
  "initial_history": [] }
// identical behavior to current production
```

## 7. Acceptance criteria

- [ ] `POST /sessions` accepts an optional `max_stage` (0–6); omitting it preserves
      current behavior exactly.
- [ ] With `max_stage = M` and `auto_stage = true`, **no** turn response ever
      returns `stage > M`, across a long adversarial conversation where the learner
      repeatedly pushes for escalation.
- [ ] The `predator_response` content at the cap is consistent with stage `≤ M`
      (no higher-stage behavior emitted under a clamped label).
- [ ] A per-turn `stage` override `> M` is clamped to `M` (or rejected, per §5.5).
- [ ] Invalid `max_stage` (out of range / wrong type) returns `400`.
- [ ] The `stage < max_stage` cases still allow free up/down movement within
      `[0, M]`.

## 8. Out of scope (possible future asks)

- A symmetric `min_stage` (floor) — not requested now, but the same mechanism would
  likely support it.
- Per-turn dynamic caps beyond the optional §5.5 behavior.

## 9. RYLAI-side integration (FYI)

For context on how we'll consume this (no action needed from your side):

- We'll add a `maxStage` field to a scenario and pass it through
  `POST /api/chat` → the session-creation payload as `max_stage`.
- It will be sent on session creation and on the session-recreation retry path
  (so an expired/re-seeded session keeps the same cap).
- The educator UI will guarantee `startingStage ≤ maxStage`.

Relevant RYLAI source (for cross-reference):
`app/api/chat/route.ts` (session/turn payloads), `lib/ai-models.ts`
(`VT_CUSTOM_BASE_URL`), `app/chat/[scenario]/page.tsx` (stage override logic).

---

**Contact:** RYLAI application team. Happy to jump on a call to align on semantics
or to adjust this spec to match your model's internals.
