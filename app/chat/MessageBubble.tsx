import { Message, CLASSIFICATION_META } from "../store/useScenarioStore";
import Avatar from "./Avatar";

interface MessageBubbleProps {
  message: Message;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showAvatar: boolean;
  avatarSeed: string;
  // For user messages: view the feedback that was generated for this reply.
  onClick?: () => void;
}

// Per-message grooming-stage indicators (color + hover tooltip) were removed in P5 (§6,
// L144/L169): stage context is conveyed by the header badge and the feedback agent's
// "Stage & Intention" part instead, so messages no longer surface a stage of their own.
export default function MessageBubble({
  message,
  isFirstInGroup,
  isLastInGroup,
  showAvatar,
  avatarSeed,
  onClick,
}: MessageBubbleProps) {
  const isPredator = message.sender === "other";

  // Classification styling for a participant (user) reply, once it has been evaluated.
  const userClass = message.sender === "user" && message.classification
    ? CLASSIFICATION_META[message.classification]
    : null;

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
        onClick={onClick}
        className={`max-w-[60%] px-4 py-2 text-sm ${getBorderRadius()} transition ${
          message.sender === "user"
            ? `bg-purple-600 text-white ${userClass ? `border-2 ${userClass.border}` : ""} ${onClick ? "cursor-pointer hover:ring-2 hover:ring-purple-300 hover:ring-offset-1" : ""}`
            : "bg-gray-100 text-gray-900 border border-gray-200"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}
