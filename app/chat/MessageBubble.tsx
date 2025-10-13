import { Message } from "../store/useScenarioStore";
import Avatar from "./Avatar";

interface MessageBubbleProps {
  message: Message;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showAvatar: boolean;
  avatarSeed: string;
}

export default function MessageBubble({
  message,
  isFirstInGroup,
  isLastInGroup,
  showAvatar,
  avatarSeed
}: MessageBubbleProps) {
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
      }`}
    >
      {message.sender === "other" && (
        <div className="w-8 flex-shrink-0 mr-1.5 flex items-end">
          {showAvatar && <Avatar seed={avatarSeed} size={24} />}
        </div>
      )}
      <div
        className={`max-w-[75%] px-4 py-2 text-sm ${getBorderRadius()} ${
          message.sender === "user"
            ? "bg-purple-600 text-white"
            : "bg-gray-100 text-gray-900"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}