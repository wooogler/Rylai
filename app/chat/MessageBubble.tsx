import { Message, GROOMING_STAGES, CLASSIFICATION_META } from "../store/useScenarioStore";
import Avatar from "./Avatar";
import { useState, useRef } from "react";

interface MessageBubbleProps {
  message: Message;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showAvatar: boolean;
  avatarSeed: string;
  // Stage used for a predator message that has no stage of its own (e.g. preset
  // opening messages) — typically the scenario's starting stage.
  fallbackStage?: number;
  // For user messages: view the feedback that was generated for this reply.
  onClick?: () => void;
}

// Border color per grooming stage (matches the header stage palette).
function stageBorderClass(stage: number): string {
  switch (stage) {
    case 0: return "border-gray-300";
    case 1: return "border-blue-300";
    case 2: return "border-cyan-300";
    case 3: return "border-yellow-400";
    case 4: return "border-orange-400";
    case 5: return "border-red-400";
    case 6: return "border-rose-500";
    default: return "border-gray-200";
  }
}

export default function MessageBubble({
  message,
  isFirstInGroup,
  isLastInGroup,
  showAvatar,
  avatarSeed,
  fallbackStage,
  onClick,
}: MessageBubbleProps) {
  const isPredator = message.sender === "other";
  const stage = isPredator
    ? (typeof message.stage === "number" ? message.stage : fallbackStage)
    : undefined;
  const stageInfo = typeof stage === "number"
    ? GROOMING_STAGES.find((s) => s.stage === stage)
    : undefined;

  // Classification styling for a participant (user) reply, once it has been evaluated.
  const userClass = message.sender === "user" && message.classification
    ? CLASSIFICATION_META[message.classification]
    : null;

  const bubbleRef = useRef<HTMLDivElement>(null);
  // Tooltip position in viewport coords (fixed positioning escapes the scroll
  // container's clipping).
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);

  const showTip = () => {
    if (!stageInfo || !bubbleRef.current) return;
    const r = bubbleRef.current.getBoundingClientRect();
    setTip({ top: r.top - 8, left: r.left });
  };
  const hideTip = () => setTip(null);

  const getBorderRadius = () => {
    if (message.sender === "user") {
      // User messages (right side)
      if (isFirstInGroup && isLastInGroup) return "rounded-2xl";
      if (isFirstInGroup) return "rounded-2xl rounded-br-md";
      if (isLastInGroup) return "rounded-2xl rounded-tr-md";
      return "rounded-2xl rounded-r-md";
    } else {
      // Other messages (left side)
      if (isFirstInGroup && isLastInGroup) return "rounded-2xl";
      if (isFirstInGroup) return "rounded-2xl rounded-bl-md";
      if (isLastInGroup) return "rounded-2xl rounded-tl-md";
      return "rounded-2xl rounded-l-md";
    }
  };

  return (
    <div
      className={`flex ${
        message.sender === "user" ? "justify-end" : "justify-start"
      } items-center gap-2`}
    >
      {isPredator && (
        <div className="w-8 flex-shrink-0 mr-1.5 flex items-end">
          {showAvatar && <Avatar seed={avatarSeed} size={24} />}
        </div>
      )}

      {/* Classification label, shown to the left of a user message */}
      {userClass && (
        <span className={`text-[11px] font-semibold ${userClass.text}`}>
          {userClass.label}
        </span>
      )}

      <div
        ref={bubbleRef}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onClick={onClick}
        className={`max-w-[60%] px-4 py-2 text-sm ${getBorderRadius()} transition ${
          message.sender === "user"
            ? `bg-purple-600 text-white ${userClass ? `border-2 ${userClass.border}` : ""} ${onClick ? "cursor-pointer hover:ring-2 hover:ring-purple-300 hover:ring-offset-1" : ""}`
            : `bg-gray-100 text-gray-900 border-2 ${
                typeof stage === "number" ? stageBorderClass(stage) : "border-gray-200"
              } ${stageInfo ? "cursor-help" : ""}`
        }`}
      >
        {message.text}
      </div>

      {/* Stage tooltip (fixed, so it isn't clipped by the chat scroll area) */}
      {tip && stageInfo && (
        <div
          className="fixed z-50 w-64 -translate-y-full rounded-lg bg-gray-900 text-white text-xs p-3 shadow-xl pointer-events-none"
          style={{ top: tip.top, left: tip.left }}
        >
          <div className="font-semibold mb-1">Stage {stageInfo.stage}: {stageInfo.name}</div>
          <div className="text-gray-200 leading-snug">{stageInfo.description}</div>
        </div>
      )}
    </div>
  );
}
