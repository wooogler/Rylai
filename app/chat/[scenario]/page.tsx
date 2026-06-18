"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { ArrowLeft, LogOut, Send, ChevronLeft, ChevronRight, RotateCcw, RefreshCw, Settings, Eye, Check, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useScenarioStore, type Message, type ScenarioProgress, type ResponseLabel, type ResponseType, GROOMING_STAGES, computeResilience, computeStreak, computeStreakLabels } from "../../store/useScenarioStore";
import MessageBubble from "../MessageBubble";
import Avatar from "../Avatar";
import TypingIndicator from "../TypingIndicator";
import FeedbackComment from "../FeedbackComment";
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
    loadScenarioProgress,
    resetScenarioProgress,
    setVtSession,
    logout
  } = useScenarioStore();

  // Redirect home only once auth state is known (cookie hydration is async).
  useEffect(() => {
    if (authHydrated && !isAuthenticated) {
      router.push('/');
    }
  }, [authHydrated, isAuthenticated, router]);

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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
    const gutterTop = gutter.getBoundingClientRect().top;
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
      const top = Math.max(desired, prevBottom + GAP);
      next.set(m.id, top);
      prevBottom = top + height;
    }
    setCommentTops(next);
  }, [messages, feedbackByMessageId, pendingFeedbackId]);

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

      await recordScenarioVisit(sc.id);
      const progressMap = await loadScenarioProgress();
      setScenarioProgressMap(progressMap);

      const ownMessages = await loadUserMessages(sc.id);
      const ownFeedbacks = await loadUserFeedbacks(sc.id);

      if (sc.persistMessages && currentScenario > 0) {
        // Continue the previous scenario's conversation; preset messages are not used.
        const { msgs: carried, fb: carriedFb } = await buildCarried();
        const combined = [...carried, ...ownMessages];
        const fbMap = new Map(carriedFb);
        ownFeedbacks.forEach((v, key) => fbMap.set(key, v));
        setMessages(combined);
        setFeedbackByMessageId(fbMap);
        restoreStage(combined);
      } else if (ownMessages.length > 0) {
        setMessages(ownMessages);
        setFeedbackByMessageId(ownFeedbacks);
        restoreStage(ownMessages);
      } else {
        setFeedbackByMessageId(new Map());
        // First time: save preset messages with unique IDs using timestamp
        const presetMessages = sc.presetMessages.map((msg, index) => ({
          ...msg,
          id: `${sc.id}-preset-${index}-${Date.now()}-${msg.id}` // Make ID unique per scenario with timestamp
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
  const generateFeedback = async (conversation: Message[], userReplyIndex: number, stage: number) => {
    const target = conversation[userReplyIndex];
    if (!target) return;
    setPendingFeedbackId(target.id);

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

      // Anchor the feedback to the participant's reply (comment card in the gutter).
      setFeedbackByMessageId(prev => new Map(prev).set(target.id, data.feedback));
      setExpandedCommentId(target.id);

      // Classification applies to a participant (user) reply only.
      const hasClassification = target.sender === 'user' && !!data.classification;
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

      // Save feedback + classification for learners
      if (userId) {
        try {
          await saveUserFeedback(scenarios[currentScenario].id, target.id, data.feedback);
          if (hasClassification) {
            await saveResponseClassification(scenarios[currentScenario].id, target.id, {
              classification: data.classification,
              responseType: data.responseType ?? 'none',
              tacticRecognized: !!data.tacticRecognized,
              protectiveStrategy: !!data.protectiveStrategy,
              rationale: data.rationale ?? '',
            });
          }
        } catch (error) {
          console.error('Failed to save feedback/classification:', error);
        }
      }
    } catch (error) {
      console.error('Feedback generation error:', error);
      setFeedbackByMessageId(prev => new Map(prev).set(target.id, 'Failed to generate feedback. Please try again.'));
      setExpandedCommentId(target.id);
    } finally {
      setPendingFeedbackId(null);
    }
  };

  const handleSendResponse = async () => {
    if (!responseText.trim() || isBusy) return;

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

    // Show the loading comment card anchored to this reply right away.
    setPendingFeedbackId(newMessage.id);

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
    // Fresh scenario: seed at its starting stage on the first turn. Persist scenario:
    // continue from the carried/current stage instead of resetting to its own stage.
    const stageOverride = scenario.autoStage && isFirstTurn
      ? (isPersist ? predictedStage : scenario.stage)
      : null;

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

        // Now give feedback on the teen's reply, with the predator's response in
        // context — this grounds the feedback in what actually happened.
        generateFeedback(conversationWithReply, userReplyIndex, replyStage);
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
  };

  const handlePreviousScenario = () => {
    if (currentScenario > 0) {
      const prevScenario = currentScenario - 1;
      router.push(`/chat/${scenarios[prevScenario].slug}`);
      setCurrentScenario(prevScenario);
      setMessages(scenarios[prevScenario].persistMessages ? [] : scenarios[prevScenario].presetMessages);
      setResponseText("");
      setIsTyping(false);
      clearFeedbackUiState();
    }
  };

  const handleNextScenario = () => {
    // Mastery gate: learners must reach the streak before advancing.
    const sc = scenarios[currentScenario];
    if (sc?.masteryEnabled && userType === 'user' && computeStreak(messages) < sc.masteryThreshold) {
      return;
    }
    if (currentScenario < scenarios.length - 1) {
      const nextScenario = currentScenario + 1;
      router.push(`/chat/${scenarios[nextScenario].slug}`);
      setCurrentScenario(nextScenario);
      setMessages(scenarios[nextScenario].persistMessages ? [] : scenarios[nextScenario].presetMessages);
      setResponseText("");
      setIsTyping(false);
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
      `Refresh "${scenarioName}"?\n\n` +
      `This loads your teacher's latest version of this scenario and starts the ` +
      `conversation over from the beginning. Your messages and feedback for this ` +
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

  // Stage shown in the chat header (read-only): predicted stage when auto, else fixed.
  const headerStage = scenario.autoStage ? (predictedStage ?? scenario.stage) : scenario.stage;
  const headerStageInfo = GROOMING_STAGES.find(s => s.stage === headerStage);
  // Resilience score over the participant's classified replies (display only).
  const resilience = computeResilience(messages);
  // Mastery: consecutive non-vulnerable replies in this scenario (carried-over excluded).
  const streakLabels = computeStreakLabels(messages);
  const streak = streakLabels.length;
  const mastered = streak >= scenario.masteryThreshold;
  // The learner can't advance until they reach the streak (admins are not gated).
  const masteryLocked = scenario.masteryEnabled && userType === 'user' && !mastered;
  // Show the lock hint only when there's actually a next scenario to unlock.
  const showLockTip = masteryLocked && currentScenario < scenarios.length - 1;

  // Messages with an anchored comment card in the gutter.
  const commentMessages = messages.filter(
    m => m.sender === 'user' && (feedbackByMessageId.has(m.id) || pendingFeedbackId === m.id)
  );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            {isAdmin ? (
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-800 font-bold transition-colors"
              >
                <Settings className="w-5 h-5" />
                Settings
              </Link>
            ) : (
              <Link href="/select-user" className="inline-flex items-center text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-5 h-5 mr-2" />
                Select a Teacher
              </Link>
            )}
            <div className="flex items-center gap-2">
              <Button
                onClick={handleResetModule}
                disabled={isResetting || isRefreshing || isBusy}
                variant="ghost"
                size="small"
                title="Reset the entire module: start the whole scenario set over from the beginning"
              >
                <RotateCcw className={`w-4 h-4 mr-2 ${isResetting ? 'animate-spin' : ''}`} />
                {isResetting ? 'Resetting…' : 'Reset'}
              </Button>
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
          <div className="mb-6">
            <h1 className="text-2xl font-bold">{scenario.name}</h1>
            <p className="text-sm text-gray-600 mt-1">{scenario.description}</p>
          </div>
        </div>

        {/* Chat card + comment gutter OUTSIDE the card (Google Docs style) */}
        <div className="flex items-stretch gap-3">
          {/* Chat card */}
          <div className="bg-white rounded-lg shadow flex-1 min-w-0 h-[700px] flex flex-col">
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
                <button
                  onClick={handleRefreshScenario}
                  disabled={isRefreshing || isResetting || isBusy}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Refresh this scenario: reload your teacher's latest version and start the conversation over"
                >
                  <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Read-only current stage (hover for description) */}
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
                {scenario.masteryEnabled ? (
                  <div className="relative group">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium cursor-help ${
                      mastered ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'
                    }`}>
                      <span>{mastered ? 'Mastered' : 'Streak'}</span>
                      <span className="flex items-center gap-1">
                        {Array.from({ length: scenario.masteryThreshold }).map((_, i) => {
                          const lbl = streakLabels[i];
                          return (
                            <span
                              key={i}
                              className={`h-2 w-4 rounded-full ${
                                lbl === 'protective' ? 'bg-green-500'
                                  : lbl === 'neutral' ? 'bg-amber-400'
                                  : 'bg-gray-200'
                              }`}
                            />
                          );
                        })}
                      </span>
                      <span>{Math.min(streak, scenario.masteryThreshold)} / {scenario.masteryThreshold}</span>
                      {mastered && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div className="absolute z-50 hidden group-hover:block top-full left-0 mt-2 w-80 p-3 rounded-lg bg-gray-900 text-white text-xs font-normal shadow-xl">
                      <div className="font-semibold mb-1">Mastery streak</div>
                      <div className="text-gray-200 leading-snug">
                        Build a streak of <span className="font-semibold">{scenario.masteryThreshold}</span> safe replies in a row
                        (<span className="text-green-300">protective</span> or <span className="text-amber-300">neutral</span>) to
                        unlock the next scenario. A <span className="text-red-300">risky</span> reply resets the streak to zero.
                      </div>
                      <div className="text-gray-300 mt-1.5">
                        Each segment shows a reply in your streak — <span className="text-green-300">green</span> is protective,{' '}
                        <span className="text-amber-300">amber</span> is neutral.
                      </div>
                    </div>
                  </div>
                ) : resilience.classified > 0 ? (
                  <div className="relative group">
                    <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 cursor-help">
                      Resilience: {resilience.score !== null ? `${Math.round(resilience.score * 100)}%` : '—'}
                    </div>
                    <div className="absolute z-50 hidden group-hover:block top-full left-0 mt-2 w-80 p-3 rounded-lg bg-gray-900 text-white text-xs font-normal shadow-xl">
                      <div className="font-semibold mb-1">Resilience score</div>
                      <div className="text-gray-200 leading-snug">
                        <span className="font-semibold">How it&apos;s calculated:</span> every reply you send is rated{' '}
                        <span className="text-green-300">protective</span>, <span className="text-amber-300">neutral</span>, or{' '}
                        <span className="text-red-300">risky</span>. The score is the percentage of protective replies out of
                        protective + risky (neutral replies don&apos;t count).
                      </div>
                      <div className="text-gray-200 leading-snug mt-1.5">
                        <span className="font-semibold">How it&apos;s used:</span> it shows how consistently you spot and resist
                        grooming tactics, and your educator and the research team use it to track your progress. Keep it high by
                        responding safely.
                      </div>
                      <div className="text-gray-300 mt-2">
                        Protective {resilience.protective} · Neutral {resilience.neutral} · Vulnerable {resilience.vulnerable}
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

                return (
                  <div
                    key={message.id}
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
                      fallbackStage={scenario.stage}
                      onClick={
                        hasComment
                          ? () => setExpandedCommentId(prev => (prev === message.id ? null : message.id))
                          : undefined
                      }
                    />
                  </div>
                );
              })}
              {isTyping && (
                <div className="mt-2">
                  <TypingIndicator avatarSeed={scenario.handle} />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <div className="bg-white border-t border-gray-200 px-6 py-4 rounded-b-lg">
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
            </div>
          </div>

          {/* Comment gutter — floats outside the chat card, comments track their
              anchor messages while the chat scrolls */}
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
                  style={{ top: top ?? 0, visibility: top === undefined ? 'hidden' : 'visible' }}
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
        </div>

        {/* Navigation */}
        <div className="mt-8">
          <div className="flex justify-between items-center">
            <Button
              onClick={handlePreviousScenario}
              disabled={currentScenario === 0}
              variant="ghost"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </Button>
            <div className="flex items-center gap-4">
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
              <p className="text-lg font-semibold text-gray-700">Scenario {currentScenario + 1} of {scenarios.length}</p>
            </div>
            <div className="relative group">
              <Button
                onClick={handleNextScenario}
                disabled={currentScenario === scenarios.length - 1 || masteryLocked}
                variant="primary"
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
                  <div className="font-semibold mb-1">Locked until mastery</div>
                  <div className="text-gray-200 leading-snug">
                    Reach a streak of <span className="font-semibold">{scenario.masteryThreshold}</span> safe replies in a row
                    (<span className="text-green-300">protective</span> or <span className="text-amber-300">neutral</span>) to
                    unlock the next scenario. You&apos;re at <span className="font-semibold">{streak}</span> / {scenario.masteryThreshold}.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
