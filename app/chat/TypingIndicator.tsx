import Avatar from "./Avatar";

interface TypingIndicatorProps {
  avatarSeed: string;
}

export default function TypingIndicator({ avatarSeed }: TypingIndicatorProps) {
  return (
    <div className="flex justify-start">
      <div className="w-8 flex-shrink-0 mr-1.5 flex items-end">
        <Avatar seed={avatarSeed} size={24} />
      </div>
      <div className="bg-gray-100 px-4 py-3 rounded-2xl">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
        </div>
      </div>
    </div>
  );
}