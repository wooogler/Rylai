"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback, Fragment } from "react";
import { LogOut, Send, ChevronLeft, ChevronRight, RotateCcw, RotateCw, Settings, Eye, Check, Lock, Info, DoorOpen } from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useScenarioStore, type Message, type ScenarioProgress, type ResponseLabel, type ResponseType, type ProgressUpdate, type Scenario, GROOMING_STAGES, computeSafeRate } from "../../store/useScenarioStore";
import MessageBubble from "../MessageBubble";
import Avatar from "../Avatar";
import TypingIndicator from "../TypingIndicator";
import FeedbackComment from "../FeedbackComment";
import CongratsModal from "../CongratsModal";
import SplashModal from "../SplashModal";
import Button from "@/components/Button";

interface PreviewFeedback {
  text: string;
  classification?: ResponseLabel;
  responseType?: ResponseType;
}

function getStageColorClass(stage: number): string {
  switch (stage) {
    case 0: return 'bg-gray-100 text-gray-600';
    case 1: return 'bg-blue-100 text-blue-700';
    case 2: return 'bg-cyan-100 text-cyan-700';
    case 3: return 'bg-yellow-100 text-yellow-700';
    case 4: return 'bg-orange-100 text-orange-700';
    case 5: return 'bg-red-100 text-red-700';
    case 6: return 'bg-rose-200 text-rose-800';
    default: return 'bg-gray-100 text-gray-400';
  }
}

// For a persist scenario the conversation continues from the previous scenario, so the
// effective starting stage is the chain origin's stage (not this scenario's own stage).
function effectiveStartStage(
  scenarios: { stage: number; persistMessages: boolean }[],
  index: number
): number {
  let k = index;
  while (k > 0 && scenarios[k]?.persistMessages) k -= 1;
  return scenarios[k]?.stage ?? 1;
}

// Stage governor helpers (§6, L198/L249) --------------------------------------
// How many of the most recent consecutive predator turns were at `stage` — i.e. how long
// the conversation has been sitting at the current stage.
function countTrailingStage(messages: Message[], stage: number): number {
  let n = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender !== 'other') continue;
    if (m.stage === stage) n++;
    else break;
  }
  return n;
}

// The classification of the most recent already-evaluated participant reply (the just-sent
// reply isn't classified yet, so this is the previous one — a best-effort proxy).
function lastClassifiedUserReply(messages: Message[]): ResponseLabel | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender === 'user' && m.classification) return m.classification;
  }
  return null;
}

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const scenarioSlug = params.scenario as string;
  const {
    scenarios,
    age,
    isAdmin,
    isAuthenticated,
    authHydrated,
    userType,
    userId,
    adminUserId,
    adminName,
    currentUser,
    setAdminContext,
    loadUserScenarios,
    saveUserMessage,
    saveUserFeedback,
    saveResponseClassification,
    savePreviewEvent,
    loadUserMessages,
    loadUserFeedbacks,
    recordScenarioVisit,
    recordScenarioLifecycle,
    loadScenarioProgress,
    resetScenarioProgress,
    markSplashSeen,
    clearSplashSeen,
    setVtSession,
    logout
  } = useScenarioStore();

  // Redirect home only once auth state is known (cookie hydration is async).
  useEffect(() => {
    if (authHydrated && !isAuthenticated) {
      router.push('/');
    }
  }, [authHydrated, isAuthenticated, router]);

  // Sync the educator's latest settings (scenario config, age, name) once auth is known.
  // The persisted store restores a snapshot on browser refresh, so without this the chat
  // would keep using stale scenario config (e.g. an outdated gate threshold) until the
  // learner re-picked their teacher or hit the destructive per-scenario Refresh.
  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return;
    reloadEducatorData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHydrated, isAuthenticated]);

  const initialScenarioIndex = scenarios.findIndex(s => s.slug === scenarioSlug);
  const [currentScenario, setCurrentScenario] = useState(initialScenarioIndex >= 0 ? initialScenarioIndex : 0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [responseText, setResponseText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  // Feedback text per participant message id (comment cards anchor to these).
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Map<string, string>>(new Map());
  // Which comment card is expanded ('preview' = the preview card next to the input).
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
  // Message id whose feedback is currently being generated (shows a loading card).
  const [pendingFeedbackId, setPendingFeedbackId] = useState<string | null>(null);
  const [scenarioProgressMap, setScenarioProgressMap] = useState<Map<number, ScenarioProgress>>(new Map());
  const [previewFeedback, setPreviewFeedback] = useState<PreviewFeedback | null>(null);
  const [previewText, setPreviewText] = useState<string>('');
  const [previewPending, setPreviewPending] = useState(false);
  const [vtSessionId, setVtSessionId] = useState<string | null>(null);
  const [predictedStage, setPredictedStage] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  // Safe Response Rate gate (§6): the congratulations modal shown once the target is
  // first reached, and the "ended" banner after the learner ends the chat / exits.
  const [showCongrats, setShowCongrats] = useState(false);
  const [endedReason, setEndedReason] = useState<'completed' | 'comfort_exit' | null>(null);
  // Scenario splash modal (§6): auto-shown on first entry, re-openable from the header ⓘ.
  const [showSplash, setShowSplash] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Bumped on every loadMessages run; a run whose seq is no longer current bails before
  // seeding/saving, so overlapping runs (e.g. during Restart) can't double-seed presets.
  const loadSeqRef = useRef(0);

  // --- Comment gutter positioning (Google Docs style) ---------------------------
  // Comments live OUTSIDE the chat card and are absolutely positioned to line up
  // with their anchor messages, without affecting the chat's own message spacing.
  const messageRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const commentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const gutterRef = useRef<HTMLDivElement>(null);
  const [commentTops, setCommentTops] = useState<Map<string, number>>(new Map());

  const scenario = scenarios[currentScenario];
  const isBusy = isTyping || pendingFeedbackId !== null || previewPending;

  // The feedback "author" shown on comment cards: the educator whose scenarios
  // are being practiced (or the educator themselves when testing).
  const teacherName = (isAdmin ? currentUser : adminName) || 'Teacher';
  const teacherSeed = (isAdmin ? userId : adminUserId) || 'rylai-teacher';

  // Recompute comment card positions: align each card with its anchor message
  // (viewport-relative), then push overlapping cards downward.
  const recomputeCommentPositions = useCallback(() => {
    const gutter = gutterRef.current;
    if (!gutter) return;
    const gutterRect = gutter.getBoundingClientRect();
    const gutterTop = gutterRect.top;
    const gutterHeight = gutterRect.height;
    const GAP = 8;
    let prevBottom = -Infinity;
    const next = new Map<string, number>();
    for (const m of messages) {
      if (m.sender !== 'user') continue;
      if (!feedbackByMessageId.has(m.id) && pendingFeedbackId !== m.id) continue;
      const anchor = messageRowRefs.current.get(m.id);
      if (!anchor) continue;
      const desired = anchor.getBoundingClientRect().top - gutterTop;
      const height = commentRefs.current.get(m.id)?.offsetHeight ?? 64;
      let top = Math.max(desired, prevBottom + GAP);
      // Keep the focused (expanded) card fully on-screen: if anchoring it would
      // push its body past the bottom of the gutter (where it'd be clipped with no
      // way to scroll), slide it up so the whole card is visible. It overlays the
      // cards above, like a focused Google-Docs comment.
      if (expandedCommentId === m.id && top + height > gutterHeight) {
        top = Math.max(GAP, gutterHeight - height - GAP);
      }
      next.set(m.id, top);
      prevBottom = top + height;
    }
    setCommentTops(next);
  }, [messages, feedbackByMessageId, pendingFeedbackId, expandedCommentId]);

  useLayoutEffect(() => {
    recomputeCommentPositions();
  }, [recomputeCommentPositions, expandedCommentId]);

  useEffect(() => {
    const onResize = () => recomputeCommentPositions();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recomputeCommentPositions]);
  // -------------------------------------------------------------------------------

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Restore the persisted VT session when switching scenarios. The displayed stage
  // starts at the scenario's starting stage, then tracks predictions (auto mode).
  useEffect(() => {
    const sc = scenarios[currentScenario];
    if (!sc) return;
    const saved = useScenarioStore.getState().vtSessions[sc.id];
    // Only restore a cached session if it was seeded at the scenario's current starting
    // stage. If the stage was changed in admin (or the cache predates this check), the
    // session is stale: forget it and start the displayed stage at the new starting stage.
    const valid = !!saved && saved.seededStage === sc.stage;
    // Persist scenarios continue from the chain origin's stage, not their own.
    const base = effectiveStartStage(scenarios, currentScenario);
    setVtSessionId(valid ? saved!.vtSessionId : null);
    setPredictedStage(valid ? (saved!.autoStage ?? base) : base);
  }, [currentScenario, scenarios]);

  useEffect(() => {
    const sc = scenarios[currentScenario];
    const seq = ++loadSeqRef.current;
    const stale = () => loadSeqRef.current !== seq;

    // Restore the displayed stage from the most recent online-stranger message.
    const restoreStage = (msgs: Message[]) => {
      const last = [...msgs].reverse().find(m => m.sender === 'other' && typeof m.stage === 'number')?.stage;
      if (typeof last === 'number') setPredictedStage(last);
    };

    // For a persist scenario, build the carried-over conversation: walk back the persist
    // chain and concatenate each source scenario's saved messages/feedback, tagging them
    // as carried (display-only; excluded from streak/resilience, not re-saved).
    const buildCarried = async (): Promise<{ msgs: Message[]; fb: Map<string, string> }> => {
      const sources: number[] = [];
      let k = currentScenario;
      while (k > 0 && scenarios[k].persistMessages) {
        sources.unshift(k - 1);
        k -= 1;
      }
      const msgs: Message[] = [];
      const fb = new Map<string, string>();
      for (const idx of sources) {
        const sid = scenarios[idx].id;
        const m = await loadUserMessages(sid);
        const f = await loadUserFeedbacks(sid);
        for (const mm of m) msgs.push({ ...mm, carried: true });
        f.forEach((v, key) => fb.set(key, v));
      }
      return { msgs, fb };
    };

    // Load the saved conversation (same path for learners and educator previews) — or
    // initialize from preset messages on first visit.
    const loadMessages = async () => {
      if (!sc) return;

      // Auto-show this scenario's splash on first entry (learner + admin preview); re-runs
      // on scenario change / reload, so it re-appears after a refresh/reset clears "seen".
      const splashText = sc.splashMarkdown?.trim();
      setShowSplash(!!splashText && !useScenarioStore.getState().splashSeen[sc.id]);

      await recordScenarioVisit(sc.id);
      const progressMap = await loadScenarioProgress();
      if (stale()) return;
      setScenarioProgressMap(progressMap);

      const ownMessages = await loadUserMessages(sc.id);
      const ownFeedbacks = await loadUserFeedbacks(sc.id);
      // A newer run superseded this one (e.g. Restart reloaded scenarios) — bail before
      // seeding so we don't write a second copy of the preset messages.
      if (stale()) return;

      if (sc.persistMessages && currentScenario > 0) {
        // Show the previous scenario's conversation for context, then a time-gap separator,
        // then THIS scenario's own preset messages (the predator re-opening the fresh, later
        // conversation) so the predator restarts it (§6, L168/L217). On the first visit we
        // seed those presets as this scenario's own messages, tagging the predator's opening
        // at this scenario's starting stage so the header/VT seed reflect the new phase.
        const { msgs: carried, fb: carriedFb } = await buildCarried();
        if (stale()) return;
        const fbMap = new Map(carriedFb);
        ownFeedbacks.forEach((v, key) => fbMap.set(key, v));

        let own = ownMessages;
        if (own.length === 0 && sc.presetMessages.length > 0) {
          // Stable ids (per scenario + index) make re-seeding idempotent: the messages API
          // dedupes by messageId, so a repeated save is a no-op instead of a duplicate.
          const seeded = sc.presetMessages.map((msg, index) => ({
            ...msg,
            id: `${sc.id}-preset-${index}-${msg.id}`,
            stage: msg.sender === 'other' ? sc.stage : undefined,
          }));
          for (const msg of seeded) {
            try {
              await saveUserMessage(sc.id, msg);
            } catch (error) {
              console.error('Failed to save preset message:', error);
            }
          }
          own = seeded;
        }

        const combined = [...carried, ...own];
        setMessages(combined);
        setFeedbackByMessageId(fbMap);
        restoreStage(combined);
      } else if (ownMessages.length > 0) {
        setMessages(ownMessages);
        setFeedbackByMessageId(ownFeedbacks);
        restoreStage(ownMessages);
      } else {
        setFeedbackByMessageId(new Map());
        // First time: seed preset messages with stable ids (per scenario + index). Stable
        // (not timestamped) so a repeated seed dedupes by messageId instead of duplicating.
        const presetMessages = sc.presetMessages.map((msg, index) => ({
          ...msg,
          id: `${sc.id}-preset-${index}-${msg.id}`
        }));
        setMessages(presetMessages);

        // Save preset messages to DB
        for (const msg of presetMessages) {
          try {
            await saveUserMessage(sc.id, msg);
          } catch (error) {
            console.error('Failed to save preset message:', error);
          }
        }
      }
    };

    loadMessages();
  }, [scenarios, currentScenario, userType, loadUserMessages, loadUserFeedbacks, saveUserMessage, recordScenarioVisit, loadScenarioProgress]);

  // Generate feedback for the participant reply at `userReplyIndex`, evaluating it with
  // the full `conversation` — which includes the predator's reply that followed it, so
  // the feedback is grounded in how the predator actually reacted. `stage` is the
  // grooming stage the reply was made in.
  //
  // `silent` (assessment mode, §6.1b): still classify the reply and record the score for
  // research — the assessment's whole point is measuring the Safe Response Rate — but show
  // NOTHING to the participant (no feedback card, no classification badge, no loading state).
  const generateFeedback = async (conversation: Message[], userReplyIndex: number, stage: number, silent = false) => {
    const target = conversation[userReplyIndex];
    if (!target) return;
    if (!silent) setPendingFeedbackId(target.id);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: conversation,
          stage,
          age,
          adminUserId: userType === 'admin' ? userId : adminUserId,
        }),
      });

      const data = await response.json();
      if (!data.feedback) throw new Error('No feedback in response');

      const hasClassification = target.sender === 'user' && !!data.classification;

      if (!silent) {
        // Anchor the feedback to the participant's reply (comment card in the gutter).
        setFeedbackByMessageId(prev => new Map(prev).set(target.id, data.feedback));
        setExpandedCommentId(target.id);
        // Classification applies to a participant (user) reply only.
        if (hasClassification) {
          setMessages(prev => prev.map(msg =>
            msg.id === target.id
              ? {
                  ...msg,
                  classification: data.classification,
                  responseType: data.responseType,
                  tacticRecognized: data.tacticRecognized,
                  protectiveStrategy: data.protectiveStrategy,
                  rationale: data.rationale,
                }
              : msg
          ));
        }
      }

      // Persist the classification + score for learners (and admin previews under their own
      // id). In silent (assessment) mode we skip the teen-facing feedback text but still
      // record the classification so the educator sees the assessment results afterward.
      if (userId && hasClassification) {
        try {
          if (!silent) {
            await saveUserFeedback(scenarios[currentScenario].id, target.id, data.feedback);
          }
          const progress = await saveResponseClassification(scenarios[currentScenario].id, target.id, {
            classification: data.classification,
            responseType: data.responseType ?? 'none',
            tacticRecognized: !!data.tacticRecognized,
            protectiveStrategy: !!data.protectiveStrategy,
            rationale: data.rationale ?? '',
          });
          // Server recomputes the scenario's Safe Response Rate; sync it and, if the target
          // was just reached (training only), show the congratulations modal.
          if (progress) applyProgressUpdate(progress);
        } catch (error) {
          console.error('Failed to save feedback/classification:', error);
        }
      }
    } catch (error) {
      console.error('Feedback generation error:', error);
      if (!silent) {
        setFeedbackByMessageId(prev => new Map(prev).set(target.id, 'Failed to generate feedback. Please try again.'));
        setExpandedCommentId(target.id);
      }
    } finally {
      if (!silent) setPendingFeedbackId(null);
    }
  };

  const handleSendResponse = async () => {
    if (!responseText.trim() || isBusy || endedReason) return;

    const textToSend = responseText;
    setResponseText("");

    // Submitting collapses any open comment right away.
    setExpandedCommentId(null);

    // Add message to chat immediately
    const newMessage: Message = {
      id: Date.now().toString(),
      text: textToSend,
      sender: "user",
      timestamp: new Date(),
    };
    const conversationWithUser = [...messages, newMessage];
    setMessages(conversationWithUser);

    // The preview (if any) is consumed by sending.
    setPreviewFeedback(null);
    setPreviewText('');

    // Show the loading comment card anchored to this reply right away (assessment mode has
    // no feedback agent, so nothing is anchored there).
    if (!scenario.assessmentMode) setPendingFeedbackId(newMessage.id);

    // Save user message for learners
    if (userId) {
      try {
        await saveUserMessage(scenarios[currentScenario].id, newMessage);
      } catch (error) {
        console.error('Failed to save user message:', error);
      }
    }

    // The stage the reply was made in (before the predator's next move).
    const userReplyIndex = conversationWithUser.length - 1;
    const replyStage = scenario.autoStage ? (predictedStage ?? scenario.stage) : scenario.stage;

    // Show typing indicator and call the VT Custom chat API
    setIsTyping(true);

    const scenarioId = scenario.id;

    // Seed StagePilot at the chosen starting stage on the first turn of a new
    // session. In auto mode the VT server ignores the session-creation `stage`
    // seed (it predicts from scratch, which yields Stage 1), so the only way to
    // honor the starting stage is to force it via the per-turn override on the
    // first turn; auto-tracking then continues from there. Fixed mode already
    // pins the stage server-side, so it needs no override.
    const isFirstTurn = !vtSessionId;
    const isPersist = scenario.persistMessages && currentScenario > 0;
    const currentStage = predictedStage ?? scenario.stage;
    // Stage governor. First turn: seed at the starting stage (fresh) / carried stage
    // (persist). Later auto turns: hold the current stage when the conversation hasn't yet
    // had `minExchangesPerStage` turns there (§6, L198 — no abrupt jumps) OR the teen's last
    // evaluated reply was protective (§6, L249 — protective replies never trigger an
    // escalation). Holding also suppresses de-escalation for that turn, an acceptable trade.
    let stageOverride: number | null = null;
    if (scenario.autoStage && isFirstTurn) {
      stageOverride = isPersist ? predictedStage : scenario.stage;
    } else if (scenario.autoStage && !scenario.assessmentMode) {
      // Assessment mode progresses naturally (no governor); training mode holds the stage
      // for pacing / after protective replies.
      const heldByPacing = countTrailingStage(messages, currentStage) < (scenario.minExchangesPerStage ?? 0);
      const heldByProtective = lastClassifiedUserReply(messages) === 'protective';
      stageOverride = heldByPacing || heldByProtective ? currentStage : null;
    }

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationHistory: messages,
        userMessage: textToSend,
        vtSessionId,
        age,
        autoStage: scenario.autoStage,
        stage: scenario.stage,
        minStage: scenario.minStage,
        maxStage: scenario.maxStage,
        stageOverride,
        predatorName: scenario.predatorName,
      }),
    })
      .then(res => res.json())
      .then(async data => {
        // Persist VT session + stage.
        const newSessionId = data.vtSessionId ?? vtSessionId;
        const newStage = data.stage;
        if (data.vtSessionId) setVtSessionId(data.vtSessionId);
        if (newStage !== undefined) setPredictedStage(newStage);
        setVtSession(scenarioId, newSessionId ?? null, newStage ?? null, scenario.stage);

        const autoReply: Message = {
          id: (Date.now() + 1).toString(),
          text: data.reply || "Sorry, I couldn't respond right now.",
          sender: "other",
          stage: typeof newStage === 'number' ? newStage : null,
          timestamp: new Date(),
        };
        const conversationWithReply = [...conversationWithUser, autoReply];

        // Keep the typing indicator up for a short, human-like beat before the reply
        // appears, scaled to reply length, so it doesn't feel like an instant bot (§6.2, L239).
        const delayMs = Math.min(3500, Math.max(1200, 900 + (data.reply?.length ?? 0) * 25));
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        setMessages(conversationWithReply);

        // Save AI reply for learners
        if (userId) {
          try {
            await saveUserMessage(scenarioId, autoReply);
          } catch (error) {
            console.error('Failed to save AI message:', error);
          }
        }

        setIsTyping(false);

        if (scenario.assessmentMode) {
          // 6.1b assessment: no feedback is SHOWN, but classify the reply silently so the
          // Safe Response Rate is recorded for research (the assessment's purpose).
          generateFeedback(conversationWithReply, userReplyIndex, replyStage, true);
          // End the session once the participant has sent `maxMessages` of their own replies
          // (L223–225). We count the participant's messages, not both sides — that's the
          // intuitive "how many responses did they give" measure for an assessment.
          const participantReplies = conversationWithReply.filter((m) => m.sender === 'user').length;
          if (scenario.maxMessages > 0 && participantReplies >= scenario.maxMessages) {
            setEndedReason('completed');
            if (userType === 'user') recordScenarioLifecycle(scenario.id, 'completed');
          }
        } else {
          // Now give feedback on the teen's reply, with the predator's response in
          // context — this grounds the feedback in what actually happened.
          generateFeedback(conversationWithReply, userReplyIndex, replyStage);
        }
      })
      .catch(error => {
        console.error('API error:', error);
        setIsTyping(false);
        setPendingFeedbackId(null);
      });
  };

  const handlePreviewFeedback = async () => {
    if (!responseText.trim() || isBusy) return;

    // Already previewed this exact text — just expand the card.
    if (previewText === responseText && previewFeedback) {
      setExpandedCommentId('preview');
      return;
    }

    setPreviewPending(true);
    const draft = responseText;
    const previewStage = predictedStage ?? scenario?.stage ?? 1;

    try {
      const previewMessage: Message = {
        id: 'preview-temp',
        text: draft,
        sender: 'user',
        timestamp: new Date(),
      };

      const conversationWithPreview = [...messages, previewMessage];

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: conversationWithPreview,
          stage: previewStage,
          age,
          adminUserId: userType === 'admin' ? userId : adminUserId,
        }),
      });

      const data = await response.json();
      if (!data.feedback) throw new Error('No feedback in response');

      setPreviewFeedback({ text: data.feedback, classification: data.classification, responseType: data.responseType });
      setPreviewText(draft);
      setExpandedCommentId('preview');

      // Log the preview event (draft + feedback) for research.
      savePreviewEvent(scenario.id, {
        draftText: draft,
        feedbackText: data.feedback,
        classification: data.classification,
        responseType: data.responseType,
        stage: previewStage,
      });
    } catch (error) {
      console.error('Preview feedback generation error:', error);
    } finally {
      setPreviewPending(false);
    }
  };

  const resetVtSession = () => {
    setVtSessionId(null);
    setPredictedStage(scenario ? scenario.stage : null);
  };

  const clearFeedbackUiState = () => {
    setFeedbackByMessageId(new Map());
    setExpandedCommentId(null);
    setPendingFeedbackId(null);
    setPreviewFeedback(null);
    setPreviewText('');
    setPreviewPending(false);
    setShowCongrats(false);
    setEndedReason(null);
  };

  // --- Safe Response Rate gate helpers (§6) --------------------------------
  // Whether the learner has satisfied a scenario's gate: the server's sticky
  // masteryReachedAt (survives later dips) OR the current rate already meets the target.
  const computeMasteryMet = (sc: Scenario): boolean => {
    if (scenarioProgressMap.get(sc.id)?.masteryReachedAt) return true;
    const info = computeSafeRate(messages, sc.masteryMinResponses ?? 20);
    return Math.round(info.rate * 100) >= (sc.masteryTargetRate ?? 80);
  };

  // Merge a server progress snapshot into the local map, and pop the congratulations modal
  // on the null->reached transition (learners only, when the gate is enabled).
  const applyProgressUpdate = (progress: ProgressUpdate) => {
    const sid = progress.scenarioId;
    const wasReached = !!scenarioProgressMap.get(sid)?.masteryReachedAt;
    const nowReached = progress.masteryReachedAt != null;
    setScenarioProgressMap(prev => {
      const next = new Map(prev);
      const cur = next.get(sid);
      next.set(sid, {
        ...(cur ?? { scenarioId: sid, firstVisitedAt: new Date(), lastVisitedAt: new Date(), visitCount: 1 }),
        protectiveCount: progress.protectiveCount,
        neutralCount: progress.neutralCount,
        vulnerableCount: progress.vulnerableCount,
        protectiveRate: progress.protectiveRate,
        masteryReachedAt: progress.masteryReachedAt ? new Date(progress.masteryReachedAt) : (cur?.masteryReachedAt ?? null),
      });
      return next;
    });
    const sc = scenarios.find(s => s.id === sid);
    if (!wasReached && nowReached && userType === 'user' && sc?.masteryEnabled && sid === scenario?.id) {
      setShowCongrats(true);
    }
  };

  // End the conversation via the final-scenario "End Chat" action (§6, L171).
  const endChat = () => {
    setShowCongrats(false);
    setEndedReason('completed');
    if (userType === 'user') recordScenarioLifecycle(scenario.id, 'completed');
  };

  // Voluntary safe exit, available at any time (§6, L216). Ends the conversation
  // immediately — no confirm dialog (team decision); Reset lets the learner start over.
  const handleComfortExit = () => {
    setShowCongrats(false);
    setEndedReason('comfort_exit');
    if (userType === 'user') recordScenarioLifecycle(scenario.id, 'comfort_exit');
  };

  const handlePreviousScenario = () => {
    if (currentScenario > 0) {
      const prevScenario = currentScenario - 1;
      router.push(`/chat/${scenarios[prevScenario].slug}`);
      setCurrentScenario(prevScenario);
      setMessages(scenarios[prevScenario].persistMessages ? [] : scenarios[prevScenario].presetMessages);
      setResponseText("");
      setIsTyping(false);
      setShowCongrats(false);
      setEndedReason(null);
      clearFeedbackUiState();
    }
  };

  const handleNextScenario = () => {
    // Safe Response Rate gate: learners must reach the target before advancing
    // (educators are never gated).
    const sc = scenarios[currentScenario];
    if (sc?.masteryEnabled && userType === 'user' && !computeMasteryMet(sc)) {
      return;
    }
    if (currentScenario < scenarios.length - 1) {
      // Advancing counts as finishing this scenario — record when (sticky, first finish).
      if (sc && userType === 'user') recordScenarioLifecycle(sc.id, 'completed');
      const nextScenario = currentScenario + 1;
      router.push(`/chat/${scenarios[nextScenario].slug}`);
      setCurrentScenario(nextScenario);
      setMessages(scenarios[nextScenario].persistMessages ? [] : scenarios[nextScenario].presetMessages);
      setResponseText("");
      setIsTyping(false);
      setShowCongrats(false);
      setEndedReason(null);
      clearFeedbackUiState();
    }
  };

  // Pull the educator's latest scenarios + global settings (e.g. age group) from the
  // DB into the store, so changes they saved on the admin page show up here without
  // leaving and re-picking the teacher.
  const reloadEducatorData = async () => {
    if (userType === 'user' && adminUserId) {
      try {
        const res = await fetch('/api/get-admin-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminId: adminUserId }),
        });
        if (res.ok) {
          const { adminUser } = await res.json();
          setAdminContext(adminUser.id, adminUser.age ?? null, adminUser.username ?? null);
        }
      } catch (error) {
        console.error('Failed to reload educator settings:', error);
      }
    }
    await loadUserScenarios();
  };

  // Refresh (per scenario): reload the teacher's latest version of THIS scenario and
  // start its conversation over from the beginning. The learner's saved messages,
  // feedback, and progress for this one scenario are cleared; other scenarios are
  // untouched. The load effect reseeds the (updated) preset messages once the store
  // refreshes, so there's no manual seeding here.
  const handleRefreshScenario = async () => {
    if (isBusy || isRefreshing || isResetting) return;

    const scenarioName = scenarios[currentScenario].name;
    if (!confirm(
      `Restart "${scenarioName}"?\n\n` +
      `This starts the conversation over from the beginning (with your teacher's ` +
      `latest version of the scenario). Your messages and feedback for this ` +
      `scenario will be cleared.`
    )) {
      return;
    }

    setIsRefreshing(true);
    try {
      const scenarioId = scenarios[currentScenario].id;

      // Clear this scenario's saved conversation/progress in the DB for learners,
      // then forget the chat session so the predator starts fresh.
      if (userId) {
        await resetScenarioProgress(scenarioId);
      }
      setVtSession(scenarioId, null, null);
      // Let this scenario's splash re-appear on the fresh start.
      clearSplashSeen([scenarioId]);

      await reloadEducatorData();

      // Re-resolve the current scenario by slug (it may have been renamed/removed).
      const updated = useScenarioStore.getState().scenarios;
      if (updated.length === 0) return;
      let idx = updated.findIndex(s => s.slug === scenarioSlug);
      if (idx < 0) idx = Math.min(currentScenario, updated.length - 1);

      setMessages([]);
      setResponseText("");
      setIsTyping(false);
      clearFeedbackUiState();
      resetVtSession();

      if (idx !== currentScenario) setCurrentScenario(idx);
      if (updated[idx].slug !== scenarioSlug) router.replace(`/chat/${updated[idx].slug}`);
    } catch (error) {
      console.error('Failed to refresh scenario:', error);
      alert('Failed to refresh. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Reset (whole module): start the entire scenario set over from the beginning, as if
  // visiting for the first time. Wipes messages/feedback/progress for EVERY scenario,
  // reloads the teacher's latest set, and jumps to the first scenario.
  const handleResetModule = async () => {
    if (isBusy || isRefreshing || isResetting) return;

    if (!confirm(
      `Reset the entire module?\n\n` +
      `This starts the whole set of scenarios over from the beginning. For every ` +
      `scenario it will permanently delete:\n` +
      `• All your messages\n• All feedback\n• Visit history\n\n` +
      `This action cannot be undone.`
    )) {
      return;
    }

    setIsResetting(true);
    try {
      // Wipe each scenario's saved data (learners) and forget its chat session.
      for (const sc of scenarios) {
        if (userId) {
          try {
            await resetScenarioProgress(sc.id);
          } catch (error) {
            console.error('Failed to reset scenario progress:', error);
          }
        }
        setVtSession(sc.id, null, null);
      }
      // Let every scenario's splash re-appear when starting the module over.
      clearSplashSeen();

      await reloadEducatorData();

      // Start over at the first scenario.
      setMessages([]);
      setResponseText("");
      setIsTyping(false);
      clearFeedbackUiState();
      resetVtSession();

      const updated = useScenarioStore.getState().scenarios;
      if (updated.length === 0) return;
      setCurrentScenario(0);
      if (updated[0].slug !== scenarioSlug) router.push(`/chat/${updated[0].slug}`);
    } catch (error) {
      console.error('Failed to reset module:', error);
      alert('Failed to reset. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  if (!scenario) return null;

  // 6.1b assessment mode hides the stage UI, the protective-rate badge, and the mastery gate,
  // and runs without the feedback agent (see handleSendResponse).
  const isAssessment = scenario.assessmentMode;

  // Stage shown in the chat header (read-only): predicted stage when auto, else fixed.
  const headerStage = scenario.autoStage ? (predictedStage ?? scenario.stage) : scenario.stage;
  const headerStageInfo = GROOMING_STAGES.find(s => s.stage === headerStage);
  // Safe Response Rate over the participant's classified replies (§6). The gate target
  // and the Max(minResponses, …) denominator floor come from the scenario config.
  const target = scenario.masteryTargetRate ?? 80;
  const rateInfo = computeSafeRate(messages, scenario.masteryMinResponses ?? 20);
  const ratePct = Math.round(rateInfo.rate * 100);
  // Sticky once the server records the target being reached (survives later dips).
  const reachedSticky = !!scenarioProgressMap.get(scenario.id)?.masteryReachedAt;
  const masteryMet = reachedSticky || ratePct >= target;
  // The learner can't advance until they meet the target (admins are not gated).
  const masteryLocked = scenario.masteryEnabled && userType === 'user' && !masteryMet && !isAssessment;
  // Show the lock hint only when there's actually a next scenario to unlock.
  const showLockTip = masteryLocked && currentScenario < scenarios.length - 1;
  const isLastScenario = currentScenario === scenarios.length - 1;

  // Messages with an anchored comment card in the gutter.
  const commentMessages = messages.filter(
    m => m.sender === 'user' && (feedbackByMessageId.has(m.id) || pendingFeedbackId === m.id)
  );

  return (
    // App-shell layout: the page itself never scrolls — the header and footer stay pinned
    // (keeping the safe-exit link always visible) and only the message list scrolls.
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* Top bar */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4">
          <h1 className="min-w-0 truncate text-lg font-bold text-gray-900" title={scenario.description}>
            {scenario.name}
          </h1>
          <div className="flex flex-shrink-0 items-center gap-2">
            {isAdmin ? (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-purple-600 transition-colors hover:bg-purple-50 hover:text-purple-800"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Link>
            ) : (
              /* Learners are bound to one educator (dedicated-URL flow) — show who, no picker. */
              <span className="hidden items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500 sm:inline-flex">
                Educator&nbsp;<span className="font-semibold text-gray-700">{adminName ?? '—'}</span>
              </span>
            )}
            <div className="relative group">
              <button
                onClick={handleResetModule}
                disabled={isResetting || isRefreshing || isBusy}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
                {isResetting ? 'Resetting…' : 'Reset all'}
              </button>
              <div className="absolute top-full right-0 z-50 mt-2 hidden w-64 rounded-lg bg-gray-900 p-3 text-xs font-normal leading-snug text-white shadow-xl group-hover:block">
                <div className="font-semibold mb-1">Reset the whole module</div>
                Starts <span className="font-semibold">every</span> scenario over from Scenario 1 and
                clears all of your messages, feedback, and progress. Use <span className="font-semibold">Restart</span> on
                a scenario to redo just that one.
              </div>
            </div>
            <Button
              onClick={async () => {
                await logout();
                router.push("/");
              }}
              variant="ghost"
              size="small"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Chat card + comment gutter OUTSIDE the card (Google Docs style) */}
      <main className="min-h-0 flex-1 px-6 py-4">
        <div className="mx-auto flex h-full w-full max-w-4xl items-stretch gap-3">
          {/* Chat card. In assessment mode there's no gutter, so center it at a comfortable
              width instead of stretching across the full container. */}
          <div className={`bg-white rounded-lg shadow h-full flex flex-col ${isAssessment ? 'mx-auto w-full max-w-2xl' : 'flex-1 min-w-0'}`}>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 rounded-t-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <Avatar seed={scenario.handle} size={40} />
                  <div>
                    <p className="font-semibold">{scenario.predatorName}</p>
                    <p className="text-sm text-gray-500">{scenario.handle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {scenario.splashMarkdown && scenario.splashMarkdown.trim() && (
                    <button
                      onClick={() => setShowSplash(true)}
                      className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                      title="About this scenario"
                    >
                      <Info className="w-5 h-5" />
                    </button>
                  )}
                  <div className="relative group">
                    <button
                      onClick={handleRefreshScenario}
                      disabled={isRefreshing || isResetting || isBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      {isRefreshing ? 'Restarting…' : 'Restart'}
                    </button>
                    <div className="absolute top-full right-0 z-50 mt-2 hidden w-64 rounded-lg bg-gray-900 p-3 text-xs font-normal leading-snug text-white shadow-xl group-hover:block">
                      <div className="font-semibold mb-1">Restart this scenario only</div>
                      Starts <span className="font-semibold">this</span> conversation over from the
                      beginning (with your teacher&apos;s latest version); its messages and feedback are
                      cleared. Other scenarios are untouched — use <span className="font-semibold">Reset all</span> for
                      the whole module.
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Read-only current stage (hidden in assessment mode — natural progression) */}
                {!isAssessment && (
                <div className="relative group">
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStageColorClass(headerStage)} ${headerStageInfo ? 'cursor-help' : ''}`}>
                    Stage {headerStage}: {headerStageInfo?.name || 'Unknown'}
                  </div>
                  {headerStageInfo && (
                    <div className="absolute z-50 hidden group-hover:block top-full left-0 mt-2 w-64 p-3 rounded-lg bg-gray-900 text-white text-xs font-normal shadow-xl">
                      <div className="font-semibold mb-1">Stage {headerStageInfo.stage}: {headerStageInfo.name}</div>
                      <div className="text-gray-200 leading-snug">{headerStageInfo.description}</div>
                    </div>
                  )}
                </div>
                )}
                {!isAssessment && (scenario.masteryEnabled || rateInfo.classified > 0) ? (
                  <div className="relative group">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-help ${
                      masteryMet ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'
                    }`}>
                      <span>Safe Response Rate: {ratePct}%</span>
                      {scenario.masteryEnabled && <span className="opacity-70">/ {target}%</span>}
                      {masteryMet && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div className="absolute z-50 hidden group-hover:block top-full left-0 mt-2 w-80 p-3 rounded-lg bg-gray-900 text-white text-xs font-normal shadow-xl">
                      <div className="font-semibold mb-1">Safe Response Rate</div>
                      <div className="text-gray-200 leading-snug">
                        <span className="font-semibold">How it&apos;s calculated:</span> every reply you send is rated{' '}
                        <span className="text-green-300">protective</span>, <span className="text-amber-300">neutral</span>, or{' '}
                        <span className="text-red-300">risky</span>. Your rate is safe replies (protective or neutral) ÷ the larger of{' '}
                        <span className="font-semibold">{scenario.masteryMinResponses ?? 20}</span> or your total replies — so a
                        few early replies can&apos;t inflate it.
                      </div>
                      {scenario.masteryEnabled && (
                        <div className="text-gray-200 leading-snug mt-1.5">
                          Reach <span className="font-semibold">{target}%</span> to unlock the next scenario. You can keep
                          practicing after that if you like.
                        </div>
                      )}
                      <div className="text-gray-300 mt-2">
                        Protective {rateInfo.protective} · Neutral {rateInfo.neutral} · Vulnerable {rateInfo.vulnerable} ·
                        Replies {rateInfo.classified}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Messages (spacing unaffected by comments) */}
            <div
              ref={messagesContainerRef}
              onScroll={recomputeCommentPositions}
              className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50 scroll-smooth"
            >
              {messages.map((message, index) => {
                const prevMessage = index > 0 ? messages[index - 1] : null;
                const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;

                const isFirstInGroup = !prevMessage || prevMessage.sender !== message.sender;
                const isLastInGroup = !nextMessage || nextMessage.sender !== message.sender;
                const showAvatar = message.sender === "other" && isLastInGroup;

                const hasComment = feedbackByMessageId.has(message.id);
                // "3 months later"-style separator after the last carried-over (previous
                // scenario) message, marking the time gap before the fresh conversation (§6, L168).
                const showTimeGapAfter = !!scenario.timeGapLabel && !!message.carried && !nextMessage?.carried;

                return (
                  <Fragment key={message.id}>
                    <div
                      ref={(el) => {
                        if (message.sender !== 'user') return;
                        if (el) messageRowRefs.current.set(message.id, el);
                        else messageRowRefs.current.delete(message.id);
                      }}
                      className={isFirstInGroup ? "mt-2" : "mt-0.5"}
                    >
                      <MessageBubble
                        message={message}
                        isFirstInGroup={isFirstInGroup}
                        isLastInGroup={isLastInGroup}
                        showAvatar={showAvatar}
                        avatarSeed={scenario.handle}
                        hideClassification={isAssessment}
                        onClick={
                          hasComment
                            ? () => setExpandedCommentId(prev => (prev === message.id ? null : message.id))
                            : undefined
                        }
                      />
                    </div>
                    {showTimeGapAfter && (
                      <div className="my-5 flex items-center gap-3">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                          {scenario.timeGapLabel}
                        </span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>
                    )}
                  </Fragment>
                );
              })}
              {isTyping && (
                <div className="mt-2">
                  <TypingIndicator avatarSeed={scenario.handle} />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input (replaced by an ended banner once the learner ends/exits) */}
            <div className="bg-white border-t border-gray-200 px-6 py-4 rounded-b-lg">
              {endedReason ? (
                <div className="flex items-center justify-center gap-2 py-2 text-center text-sm text-gray-600">
                  <Check className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                  {endedReason === 'completed'
                    ? "You've ended this conversation — nice work! Use Reset to start over."
                    : "You've ended this conversation. It's okay to step away anytime."}
                </div>
              ) : (
              <>
              <div className="relative">
                <div className={`relative ${responseText.trim() && !isBusy ? 'ring-2 ring-gray-400 ring-offset-2 rounded-full transition-all' : ''}`}>
                  <input
                    type="text"
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendResponse();
                      }
                    }}
                    disabled={isBusy}
                    className="w-full pl-6 pr-28 py-4 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:cursor-not-allowed text-base"
                    placeholder="Send a message..."
                  />
                  {responseText.trim() && !isBusy && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      {!isAssessment && (
                      <div className="relative group">
                        <button
                          onClick={handlePreviewFeedback}
                          className="p-2.5 bg-blue-500 rounded-full text-white hover:bg-blue-600 transition-colors"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <div className="absolute z-50 hidden group-hover:block bottom-full right-0 mb-2 w-56 p-2.5 rounded-lg bg-gray-900 text-white text-xs shadow-xl pointer-events-none">
                          Preview {teacherName}&apos;s feedback on your draft before sending it.
                        </div>
                      </div>
                      )}
                      <div className="relative group">
                        <button
                          onClick={handleSendResponse}
                          className="p-2.5 bg-purple-600 rounded-full text-white hover:bg-purple-700 transition-colors"
                        >
                          <Send className="w-5 h-5 fill-current" />
                        </button>
                        <div className="absolute z-50 hidden group-hover:block bottom-full right-0 mb-2 px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-xs shadow-xl pointer-events-none whitespace-nowrap">
                          Send message
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              </>
              )}
            </div>
          </div>

          {/* Comment gutter — floats outside the chat card, comments track their anchor
              messages while the chat scrolls. Hidden in assessment mode (no feedback), so the
              chat card centers instead of leaving an empty column to its right. */}
          {!isAssessment && (
          <div ref={gutterRef} className="hidden md:block w-72 flex-shrink-0 relative overflow-hidden">
            {commentMessages.map((message) => {
              const fb = feedbackByMessageId.get(message.id);
              const isPendingCard = pendingFeedbackId === message.id && fb === undefined;
              const top = commentTops.get(message.id);
              return (
                <div
                  key={message.id}
                  ref={(el) => {
                    if (el) commentRefs.current.set(message.id, el);
                    else commentRefs.current.delete(message.id);
                  }}
                  className="absolute left-0 right-0"
                  style={{
                    top: top ?? 0,
                    visibility: top === undefined ? 'hidden' : 'visible',
                    zIndex: expandedCommentId === message.id ? 20 : undefined,
                  }}
                >
                  <FeedbackComment
                    name={teacherName}
                    avatarSeed={teacherSeed}
                    text={fb ?? ''}
                    classification={message.classification ?? undefined}
                    responseType={message.responseType ?? undefined}
                    loading={isPendingCard}
                    expanded={expandedCommentId === message.id}
                    onToggle={() => setExpandedCommentId(prev => (prev === message.id ? null : message.id))}
                  />
                </div>
              );
            })}

            {/* Preview card, anchored to the input row at the bottom */}
            {(previewPending || previewFeedback) && (
              <div className="absolute left-0 right-0 bottom-3">
                <FeedbackComment
                  name={teacherName}
                  avatarSeed={teacherSeed}
                  subtitle="Preview"
                  text={previewFeedback?.text ?? ''}
                  classification={previewFeedback?.classification}
                  responseType={previewFeedback?.responseType}
                  loading={previewPending}
                  expanded={expandedCommentId === 'preview'}
                  onToggle={() => setExpandedCommentId(prev => (prev === 'preview' ? null : 'preview'))}
                />
              </div>
            )}
          </div>
          )}
        </div>
      </main>

      {/* Bottom bar: navigation + always-visible safe exit (pinned to the screen's right corner) */}
      <footer className="relative flex-shrink-0 border-t border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto w-full max-w-4xl">
          <div className="flex items-center justify-center gap-10">
            <Button
              onClick={handlePreviousScenario}
              disabled={currentScenario === 0}
              variant="ghost"
              size="small"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <div className="flex items-center space-x-2">
                {scenarios.map((scenario, index) => {
                  const progress = scenarioProgressMap.get(scenario.id);
                  const isVisited = !!progress;

                  return (
                    <div
                      key={index}
                      className="relative group"
                      title={isVisited ? `Visited ${progress.visitCount} time(s)\nLast: ${progress.lastVisitedAt.toLocaleString()}` : 'Not visited yet'}
                    >
                      <div
                        className={`w-2 h-2 rounded-full transition-all ${
                          index === currentScenario
                            ? "bg-purple-600 w-8"
                            : isVisited
                            ? "bg-green-500"
                            : "bg-gray-300"
                        }`}
                      />
                      {isVisited && index !== currentScenario && (
                        <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-green-600 rounded-full" />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-sm font-semibold text-gray-700">Scenario {currentScenario + 1} of {scenarios.length}</p>
            </div>
            <div className="relative group">
              <Button
                onClick={handleNextScenario}
                disabled={currentScenario === scenarios.length - 1 || masteryLocked}
                variant="primary"
                size="small"
                className={showLockTip ? 'pointer-events-none' : undefined}
              >
                <span className="flex items-center">
                  {showLockTip && <Lock className="w-4 h-4 mr-1.5" />}
                  Next
                  <ChevronRight className="w-5 h-5 ml-1" />
                </span>
              </Button>
              {showLockTip && (
                <div className="absolute z-50 hidden group-hover:block bottom-full right-0 mb-2 w-64 p-3 rounded-lg bg-gray-900 text-white text-xs font-normal shadow-xl">
                  <div className="font-semibold mb-1">Locked until you reach {target}%</div>
                  <div className="text-gray-200 leading-snug">
                    Keep replying safely to raise your <span className="font-semibold">Safe Response Rate</span> to{' '}
                    <span className="font-semibold">{target}%</span> and unlock the next scenario. You&apos;re at{' '}
                    <span className="font-semibold">{ratePct}%</span>.
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Safe exit (§6 L216): leaves the conversation immediately, no confirm.
            The L118 withdraw notice appears in a hover tooltip. */}
        {!endedReason && (
          <div className="group absolute right-6 top-1/2 -translate-y-1/2">
            <button
              onClick={handleComfortExit}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50/70 px-3.5 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-100"
            >
              <DoorOpen className="w-4 h-4" />
              I don&apos;t feel comfortable anymore.
            </button>
            <div className="absolute bottom-full right-0 z-50 mb-2 hidden w-72 rounded-lg bg-gray-900 p-3 text-xs font-normal leading-snug text-white shadow-xl group-hover:block">
              If any part of this conversation makes you feel uncomfortable or unsafe, you can
              leave at any time without penalty. Clicking this ends the conversation immediately.
            </div>
          </div>
        )}
      </footer>

        {showSplash && scenario.splashMarkdown && scenario.splashMarkdown.trim() && (
          <SplashModal
            content={scenario.splashMarkdown}
            onStart={() => { markSplashSeen(scenario.id); setShowSplash(false); }}
          />
        )}

        {showCongrats && (
          <CongratsModal
            targetPct={target}
            isLast={isLastScenario}
            onContinue={() => setShowCongrats(false)}
            onNext={handleNextScenario}
            onEnd={endChat}
          />
        )}
    </div>
  );
}
