import { Message } from "../store/useScenarioStore";
import Avatar from "./Avatar";
import { useState } from "react";

interface MessageBubbleProps {
  message: Message;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showAvatar: boolean;
  avatarSeed: string;
  onClick?: () => void;
  onHover?: (isHovering: boolean) => void;
  hasFeedback?: boolean;
  isSelected?: boolean;
  isInHoverRange?: boolean;
}

export default function MessageBubble({
  message,
  isFirstInGroup,
  isLastInGroup,
  showAvatar,
  avatarSeed,
  onClick,
  onHover,
  hasFeedback = false,
  isSelected = false,
  isInHoverRange = false
}: MessageBubbleProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHover?.(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHover?.(false);
  };

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

  const getBorderStyle = () => {
    if (isSelected) return "ring-2 ring-blue-500 ring-offset-2";
    if (isHovered && hasFeedback) return "ring-2 ring-blue-500 ring-offset-2";
    if (isHovered && !hasFeedback) return "ring-2 ring-blue-400 ring-offset-2";
    if (isInHoverRange) return "ring-2 ring-blue-300 ring-offset-2";
    if (hasFeedback) return "ring-2 ring-gray-400 ring-offset-2";
    return "";
  };

  const getHoverText = () => {
    if (hasFeedback) return "View feedback";
    return "Generate feedback";
  };

  return (
    <div
      className={`flex ${
        message.sender === "user" ? "justify-end" : "justify-start"
      } items-center gap-2`}
    >
      {message.sender === "other" && (
        <div className="w-8 flex-shrink-0 mr-1.5 flex items-end">
          {showAvatar && <Avatar seed={avatarSeed} size={24} />}
        </div>
      )}

      {/* Hover text for user messages (left side) */}
      {message.sender === "user" && isHovered && onClick && (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {getHoverText()}
        </span>
      )}

      <div
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`max-w-[60%] px-4 py-2 text-sm ${getBorderRadius()} ${getBorderStyle()} transition-all ${
          message.sender === "user"
            ? "bg-purple-600 text-white"
            : "bg-gray-100 text-gray-900"
        }`}
      >
        {message.text}
      </div>

      {/* Hover text for other messages (right side) */}
      {message.sender === "other" && isHovered && onClick && (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {getHoverText()}
        </span>
      )}
    </div>
  );
}