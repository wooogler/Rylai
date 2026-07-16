# RYLAI 6장 정합화 — 구현 계획

> **기반 문서**: `docs/RYLAI 6장 요구사항 갭 분석.md` (2026-07-16)
> **확정된 방향** (팀 결정):
> 1. **80% 점수 게이트가 정본** — streak 기반 mastery 게이트를 80% Protective Response Rate 게이트로 교체한다.
> 2. **시나리오 2는 이월 + 구분선** — 시나리오 1 대화를 표시용으로 이월하고 "3 months later" 구분선을 넣는다 (L181의 "필드 제거"는 무시, L168/210을 따른다).
> 3. **문서 사양의 기본 시나리오 config를 만들고**, 교육자가 수정할 수 있게 한다.
> 4. **현재 config로 표현 못 하는 부분은 config 필드/기능 추가로 커버**한다.
>
> 설계 원칙: 문서의 연구 플로우를 **config로 표현 가능하게** 만들고, 문서 사양은 그 config의 **기본값**으로 제공한다. 하드코딩 최소화.

---

## 전체 그림 — 단계 구성과 의존성

| 단계 | 내용 | 의존성 | 규모 |
|---|---|---|---|
| **P0** | DB 스키마 확장 + 마이그레이션 | 없음 (최우선) | 소 |
| **P1** | 80% 점수 체계 (공식·명칭·모달·게이트·저장) | P0 | 중 |
| **P2** | 시나리오 2 연속성 (이월 기본화 + "3 months later" 구분선) | P0 | 소 |
| **P3** | 기본 시나리오 재편 + 스플래시/환영 콘텐츠 + 관리자 에디터 | P0, P1 | 중~대 |
| **P4** | 피드백 3파트 구조화 + 표시 옵션 + 응답 지연 | 없음 (병행 가능) | 중 |
| **P5** | 스테이지 거버너 + 안전 종료 + 호버 제거 | P1 (종료 상태 공유) | 중 |
| **P6** | (범위 확인 후) Access Code · 6.1b 평가 모드 · 교육자 전용 URL | P0~P5과 독립 | 대 |

P1~P3이 핵심 경로. P4, P5는 병행 가능.

---

## P0. DB 스키마 확장 + 마이그레이션

`lib/db/schema.ts` 변경 후 `npx drizzle-kit generate` → `lib/db/migrations/0007_*.sql` 생성 → `npm run db:migrate`.

**scenarios 테이블 — 추가 컬럼**

| 컬럼 | 타입/기본값 | 용도 |
|---|---|---|
| `masteryTargetRate` | int, default **80** | 게이트 목표 비율(%) — L135/146 |
| `masteryMinResponses` | int, default **20** | 공식의 분모 하한 — L137 `Max(20, …)` |
| `timeGapLabel` | text, default `''` | 이월 경계에 표시할 구분선 문구 (S2 기본 "3 months later") — L168 |
| `splashMarkdown` | text, nullable | 시나리오 스플래시 모달 콘텐츠 (마크다운) — L123–137 |
| `minExchangesPerStage` | int, default **5** | 스테이지 상승 전 최소 교환 횟수 — L198 |

- 기존 `masteryThreshold`(streak 개수)는 **컬럼은 유지하되 코드에서 사용 중단** (SQLite 컬럼 드랍 회피, legacy 주석 명기). `masteryEnabled`는 게이트 on/off로 계속 사용.

**users 테이블 — 추가 컬럼**

| 컬럼 | 타입 | 용도 |
|---|---|---|
| `welcomeMarkdown` | text, nullable | 교육자별 환영 화면 콘텐츠 — L105–121, L183 |

**scenario_progress 테이블 — 추가 컬럼** (L248 점수 로깅)

| 컬럼 | 타입 | 용도 |
|---|---|---|
| `protectiveCount` / `neutralCount` / `vulnerableCount` | int, default 0 | 분류 카운트 스냅샷 |
| `protectiveRate` | real, nullable | 최신 보호 응답 비율 |
| `masteryReachedAt` | timestamp_ms, nullable | 80% 최초 도달 시각 (**sticky 잠금 해제의 근거**) |
| `comfortExitAt` | timestamp_ms, nullable | "I don't feel comfortable anymore." 종료 시각 — L216 |
| `completedAt` | timestamp_ms, nullable | End Chat 시각 — L171 |

- `users.feedbackConfig`는 JSON 컬럼이므로 **마이그레이션 없이** 타입만 확장 (P4 참조).

---

## P1. 80% Protective Response Rate 체계

### 1-1. 점수 공식 교체 — `app/store/useScenarioStore.ts`

- `computeResilience`(:53-76) → `computeProtectiveRate(messages, minResponses)`로 대체:
  ```
  rate = protective / max(minResponses, protective + neutral + vulnerable)
  ```
  - **neutral을 분모에 포함**하고 **하한(minResponses, 기본 20)** 적용 — L137 정확 준수.
  - carried 메시지 제외 로직은 유지 (`m.carried` skip).
  - 반환: `{ protective, neutral, vulnerable, classified, rate }` (rate는 0~1, 분모 하한 때문에 항상 계산 가능 — null 불필요).
- `computeStreak` / `computeStreakLabels`(:81-103) **삭제** 및 모든 호출부 제거.

### 1-2. 게이트 로직 교체 — `app/chat/[scenario]/page.tsx`

- `handleNextScenario`(:535-540): streak 검사 → **sticky 도달 검사**로 교체:
  `unlocked = masteryReachedAt != null || rate*100 >= scenario.masteryTargetRate`
  - 도달 이력(`masteryReachedAt`)은 서버(scenario_progress)가 정본, 스토어에 미러. **한 번 도달하면 이후 비율이 떨어져도 잠금 해제 유지** (L33 "Once they reach the required threshold level, the next scenario is activated").
- `masteryLocked`(:690) 동일 기준으로 교체. 관리자는 기존처럼 게이트 미적용.

### 1-3. 축하 모달 (신규 컴포넌트 `app/chat/CongratsModal.tsx`)

- 트리거: 분류 결과가 반영될 때마다 rate 재계산 → `masteryEnabled && userType==='user' && rate ≥ target && 최초 도달`이면 표시. 도달 시각을 `/api/scenario-progress`에 기록(`masteryReachedAt`).
- 문구 (L146/L171 정확 준수):
  - 다음 시나리오가 **있으면**: "Congratulations, you have reached 80% of the protective response rate, you can either continue chatting within this scenario or move to the next scenario." + 버튼 **Continue Chatting** / **Next Scenario**
  - 마지막 시나리오면: "…or end the conversation." + 버튼 **Continue Chatting** / **End Chat**
  - "80%"는 `masteryTargetRate` 값으로 동적 표기.
- **End Chat** → 종료 상태: 입력 비활성 + 완료 안내 카드, `completedAt` 기록. (P5의 comfort-exit와 동일한 ended-state 메커니즘 공유.)
- 모달은 최초 도달 시 1회 자동 표시, 이후 헤더 배지 클릭으로 재확인 가능.

### 1-4. 명칭 변경 + 배지

- "Resilience" → **"Protective Response Rate"** (`page.tsx:825,828` 및 툴팁 본문). 툴팁 공식 설명도 새 공식으로 재작성 (neutral 포함, 20개 하한, 진행 중 카운트 표시 `분류된 응답 n/20`).
- streak 배지 블록(:785-821) 제거 → masteryEnabled 여부와 관계없이 **rate 배지 단일화** (masteryEnabled면 목표 대비 진행 표시: `72% / 80%` + 도달 시 체크).

### 1-5. 점수 서버 저장 (L248)

- 분류 저장 경로(`/api/messages`의 classification 갱신 처리)에서 서버가 `user_messages`를 집계해 `scenario_progress`의 카운트·rate를 **재계산 upsert** (클라이언트 값을 믿지 않음 → 드리프트 방지).
- `masteryReachedAt`은 rate가 target 이상이 된 최초 시점에 서버에서 set (이미 있으면 유지).

### 1-6. 관리자 UI — `app/admin/page.tsx`

- 시나리오 편집기의 "Require mastery" 블록(:725-761): streak threshold 입력 제거 → **Target rate (%)** (기본 80)와 **Minimum responses** (기본 20) 입력으로 교체. 라벨을 "80% Protective Response Score gate" 개념에 맞게 재작성.
- `app/api/scenarios/route.ts`: 신규 필드 read/write 추가 (`masteryTargetRate`, `masteryMinResponses`).
- Export/Import(admin) 대상 필드에 신규 컬럼 포함 여부 확인·추가.

---

## P2. 시나리오 2 연속성 — 이월 + "3 months later" 구분선

- **구분선 렌더링** — `page.tsx` 메시지 렌더(:855-890): `combined` 배열에서 `carried → own` 경계에 가운데 정렬 디바이더 렌더 (`── 3 months later ──` 스타일). 문구는 `scenario.timeGapLabel`(비면 구분선 생략). carried 메시지는 기존처럼 점수 계산 제외 유지.
- **VT 세션 시딩**: 현재 combined 전체가 `/api/chat` conversationHistory로 전달되어 세션 시드에 포함됨 — 동일 인물 연속성(L217)에 부합하므로 유지. (선택 검증: 시드 히스토리에 `("3 months later")` 내레이션 라인 삽입이 VT 응답 품질에 도움이 되는지 구현 중 테스트 — 부작용 있으면 생략.)
- **관리자 UI**: persistMessages 토글은 **유지** (팀 결정). 토글 옆에 `Time-gap separator label` 텍스트 입력 추가 (persistMessages on일 때만 활성).
- `app/api/scenarios/route.ts` + 스토어 Scenario 타입에 `timeGapLabel` 추가.

---

## P3. 기본 시나리오 재편 + 환영/스플래시 콘텐츠

### 3-1. `lib/default-scenarios.ts` 전면 교체 — 문서 사양 2개 시나리오

| 필드 | Scenario 1 | Scenario 2 |
|---|---|---|
| slug | `scenario-1-meeting-someone-new` | `scenario-2-more-personal` |
| name | `Scenario 1: Meeting Someone New Online` (L139) | `Scenario 2: An Online Relationship That Has Become More Personal` (L163) |
| predatorName / handle | **Alex** / `@alexgamer99` (L140) | **Alex** / `@alexgamer99` (동일 인물, L164) |
| description | L141 원문 그대로 | L165 원문 그대로 |
| stage / minStage / maxStage | 1 / **1 / 3** (L209) | 4 / **4 / 6** (L210) |
| autoStage | true | true |
| masteryEnabled / targetRate / minResponses | true / 80 / 20 | true / 80 / 20 |
| persistMessages / timeGapLabel | false / `''` | **true** / `"3 months later"` |
| minExchangesPerStage | 5 | 5 |
| splashMarkdown | L125–137 콘텐츠 (Stage 1–3 설명 + "What will you do?" + 80% 규칙) | L149–159 콘텐츠 (Exclusivity/Sexual/Conclusion + 80% 규칙) |
| presetMessages | Alex의 가벼운 첫 인사 1–2개 | 재회 인사 1개 (예: "hey! feels like we've been talking forever now 😊") — 편집 가능 |

- 교육자 signup 시드(`createDefaultScenarios`)가 신규 필드 포함하도록 갱신.
- **기존 교육자 계정**: 새 기본값은 신규 가입에만 적용되므로, admin에 **"Restore default scenarios"** 버튼 추가 (확인 다이얼로그 → 기존 시나리오 삭제 후 재시드). 연구팀 계정 전환용.

### 3-2. 환영 화면 (신규 라우트 `app/welcome/page.tsx`)

- 학습자 플로우: `/select-user`에서 교육자 선택 → **`/welcome`** (교육자의 `welcomeMarkdown` 렌더) → 하단 **"Let's Begin"** → 첫 시나리오 채팅. `welcomeMarkdown`이 비어 있으면 기존처럼 바로 채팅으로.
- 교육자 signup 시 `welcomeMarkdown` 기본값으로 L108–121 콘텐츠 시드 ("What is RYLAI?" / "How the experience works" / Note).
- middleware 보호 경로에 `/welcome` 추가.

### 3-3. 스플래시 모달 (신규 컴포넌트 `app/chat/SplashModal.tsx`)

- 채팅 위 오버레이, **스크롤 가능한 컨테이너** (L124), react-markdown으로 `scenario.splashMarkdown` 렌더, 하단 "Start Chatting" 버튼.
- 표시 규칙: 시나리오 **첫 진입 시 자동 표시** (스토어에 per-scenario `splashSeen` 기록, persist), 헤더의 ⓘ 아이콘으로 언제든 재열람.
- 관리자 미리보기(Test Chat 진입)에서도 동일 동작.

### 3-4. 철회 고지 푸터 (신규 컴포넌트 `app/chat/DisclaimerFooter.tsx`)

- L118 문구를 predator 챗봇이 있는 페이지(채팅 페이지, 관리자 테스트 챗 동일 페이지) 하단에 고정 표시 (L119).
- 상수 기본 문구로 시작. (교육자 커스터마이징은 필요해지면 후속 — 계획 외.)

### 3-5. 관리자 마크다운 에디터 2종 — `app/admin/page.tsx`

- **Welcome 에디터**: Scenarios 탭 상단에 교육자 단위 "Welcome screen" 카드 (textarea + 접이식 미리보기, react-markdown). 저장은 `get-admin-info` PATCH 확장(`welcomeMarkdown`).
- **스플래시 에디터**: 각 시나리오 편집기 내 "Splash screen (Markdown)" textarea + 미리보기.
- Export/Import에 `welcomeMarkdown`·`splashMarkdown` 포함.

---

## P4. 피드백 3파트 구조화 + 표시 옵션 + 지연

### 4-1. 구조화 출력 — `lib/feedback-runner.ts`, `lib/feedback-prompts.ts`

- `FeedbackResult.feedback: string` → 3개 필드로 교체:
  - `yourResponse` — "Your Response (What you said)": 분류 결과 + **왜 그렇게 분류됐는지** 티엔 대상 설명 (L235 — 현재 rationale은 연구자 전용이므로 별도로 티엔용 이유를 이 파트에 포함)
  - `stageIntent` — "Stage and Intention of Other Person": 현재 스테이지 + 위험 + **구체적 전술** (L236, generic 금지)
  - `nextMove` — "How to Respond Next?": 다음 턴 전략 1가지 (L237)
- `RESULT_SCHEMA`(strict) 갱신. `FEEDBACK_INSTRUCTION` 재작성: 각 파트 1–2문장, **콜론 구분 + 핵심 볼드** (L240 — 기존 "no headings, no bullet lists" 제약 삭제), 지지적·간결 톤 유지.
- 분류 필드들(classification/responseType/…)은 그대로.

### 4-2. 표시 설정 — `FeedbackConfig` 확장 (JSON, 마이그레이션 불필요)

```ts
interface FeedbackConfig {
  …기존…
  parts?: { yourResponse?: boolean; stageIntent?: boolean; nextMove?: boolean }; // 기본 모두 true
  displayMode?: 'collective' | 'tabs'; // 기본 'collective'
}
```
- `/api/feedback`: 비활성 파트는 응답에서 제외(또는 빈 값). 프롬프트에서도 해당 파트 생성 생략(토큰 절약).
- **관리자 UI** (`app/admin/PromptEditor.tsx`): "Feedback display" 섹션 신설 — 파트별 체크박스 3개 (L238 토글) + Collective/Tabs 라디오 (L187–188, L238).

### 4-3. 렌더링 — `app/chat/FeedbackComment.tsx`

- collective: 라벨 볼드 + 콜론의 3단 스택 (`**Your Response:** …`).
- tabs: 카드 상단 미니 탭 3개 (활성 파트만).
- **저장 형식**: `user_feedbacks.feedbackText`에 JSON 문자열 `{v:2, yourResponse, stageIntent, nextMove}` 저장. 로더는 `JSON.parse` 시도 → 실패 시 legacy 평문으로 렌더 (하위 호환).

### 4-4. 응답 지연 (L239) — `page.tsx` 전송 플로우(:378-444)

- 예측 응답 도착 후 즉시 표시하지 않고 typing indicator 유지: `delay = clamp(1200 + reply.length*30, 1200, 3500)ms` 후 메시지 추가. 상수로 시작 (config화는 후속).

---

## P5. 스테이지 거버너 + 안전 종료 + 호버 제거

### 5-1. 메시지 호버 스테이지 제거 (L144/169)

- `app/chat/MessageBubble.tsx`: 스테이지 호버 툴팁/보더/cursor-help 제거 (:57-126 중 해당 부분). 데이터(stage)는 저장 유지 — UI만 제거.

### 5-2. 스테이지 거버너 (L198 + L249)

- `page.tsx` 전송 직전 계산하는 `resolveStageOverride()` 신설:
  1. **완급 (L198)**: 메시지들의 stage 필드로 "현재 스테이지에서의 교환 수" 계산 → `< scenario.minExchangesPerStage`(기본 5)면 `stageOverride = 현재 스테이지` (상승 억제; 하강은 허용 — de-escalation 보존).
  2. **보호 응답 비상승 (L249)**: 직전 사용자 응답의 분류가 `protective`면 `stageOverride = 현재 스테이지`.
  - 기존 `/api/chat`의 `stageOverride` 파라미터를 그대로 활용 — 서버 변경 불필요.
  - 주의: 분류는 비동기 도착이므로 "가장 최근에 알려진 분류" 기준, 미분류면 규칙 2 미적용 (계획서에 한계 명기).
- 관리자 시나리오 편집기에 `Min exchanges per stage` 숫자 입력 추가.

### 5-3. 안전 종료 (L203, L216)

- 채팅 입력창 하단에 **"I don't feel comfortable anymore."** 텍스트 버튼 (은은하지만 상시 노출).
- 클릭 → 확인 다이얼로그 → **ended 상태**: 입력 비활성, 지지적 안내 카드(괜찮다는 메시지 + 도움 리소스 문구), `scenario_progress.comfortExitAt` 기록. Reset/Refresh로 재시작 가능.
- ended 상태 메커니즘은 P1의 End Chat과 공유 (사유만 구분: completed vs comfort_exit).

---

## P6. 범위 확인 필요 (이번 라운드 제외 권장, 착수 전 결정)

| 항목 | 내용 | 권장 |
|---|---|---|
| **Access Code 가입 게이트** (L101–102) | `access_codes` 테이블 + 관리자 코드 발급 UI + signup 검증. 참가자 모집 **전**에는 필수 | 다음 라운드 최우선 |
| **6.1b 평가 전용 챗봇** (L219–226) | 스테이지 비표시 자연 진행 모드 + 종료 조건(100 메시지 등). 본 스터디 평가 단계용 | 별도 라운드 |
| **교육자 전용 URL** (L96–97) | `app/[educator]` 라우팅 + select-user 제거 + 교육자 목록 비노출. 라우팅 구조 변경 큼 | 별도 라운드 |
| 가입 후 자동 로그인 → 로그인 페이지 경유로 변경 (L103) | UX 후퇴 성격이라 연구팀 확인 후 | 보류 |

---

## 구현 중 판단이 필요한 소소한 결정 (기본안 제시)

1. **스플래시 표시 빈도**: 기본안 = 시나리오 첫 진입 시 1회 자동 + ⓘ로 재열람. (매 진입 시 표시가 낫다면 플래그만 변경.)
2. **모달 재표시**: 80% 모달은 최초 도달 시 1회. 이후 rate 배지에 "목표 달성" 상태 유지.
3. **S2 preset 메시지 문구**: 기본 1줄 재회 인사 — 연구팀이 관리자에서 수정 가능하므로 placeholder 성격.
4. **VT 시드에 time-gap 내레이션 삽입 여부**: 구현 중 실험 후 결정 (기본은 미삽입).

---

## 검증 계획 (구현 완료 기준)

1. `npm run build` + `npm run db:migrate` (데이터 사본에서 선행 테스트).
2. **E2E 수동 시나리오**:
   - 신규 교육자 가입 → 기본 시나리오 2개(Alex, 1–3/4–6, 스플래시/환영 시드) 확인
   - 학습자: 교육자 선택 → **환영 화면** → Let's Begin → **S1 스플래시** → 채팅 (rate 배지 = protective/max(20,total)) → 20개 미만 구간에서 분모 20 고정 확인 → 80% 도달 → **축하 모달** → Next Scenario → **S2 스플래시** → S1 대화 이월 + **"3 months later" 구분선** → 80% 도달 → **End Chat** → ended 상태
   - 피드백: 3파트 라벨 표시, 관리자에서 파트 토글·tabs 전환 반영, 예측 응답 지연 체감
   - 스테이지: 각 스테이지 최소 5교환 전 상승 억제, protective 직후 상승 억제, 메시지 호버 없음
   - "I don't feel comfortable anymore." → ended + `comfortExitAt` 기록
   - DB: `scenario_progress`에 카운트/rate/`masteryReachedAt` 적재 확인
3. **회귀**: 관리자 Export→Import 왕복에 신규 필드 보존, 기존 저장 피드백(평문) 렌더 정상, 관리자 Test Chat 게이트 미적용 유지.
