"use client";

import Avatar from "./Avatar";
import ReactMarkdown from "react-markdown";
import { CLASSIFICATION_META, RESPONSE_TYPE_META, type ResponseLabel, type ResponseType } from "../store/useScenarioStore";

interface FeedbackCommentProps {
  name: string;
  avatarSeed: string;
  text: string;
  classification?: ResponseLabel;
  responseType?: ResponseType;
  loading?: boolean;
  expanded: boolean;
  onToggle: () => void;
  // Small label next to the name, e.g. "Preview".
  subtitle?: string;
}

// A Google Docs-style comment card, anchored next to the message it evaluates.
// Collapsed: author + classification + first ~2 lines. Click to expand/collapse.
export default function FeedbackComment({
  name,
  avatarSeed,
  text,
  classification,
  responseType,
  loading = false,
  expanded,
  onToggle,
  subtitle,
}: FeedbackCommentProps) {
  const meta = classification ? CLASSIFICATION_META[classification] : null;
  // The paper's response-type sub-label (hidden for neutral / 'none').
  const typeMeta =
    responseType && responseType !== "none" ? RESPONSE_TYPE_META[responseType] : null;
  const typeBadge =
    typeMeta && typeMeta.polarity !== "none" ? CLASSIFICATION_META[typeMeta.polarity].badge : "";
  // Focused (expanded) cards take the color assigned to the evaluation;
  // collapsed cards stay gray.
  const expandedBorder = meta ? meta.border : "border-gray-400";

  return (
    <div
      onClick={loading ? undefined : onToggle}
      className={`bg-white rounded-lg border p-3 transition-all ${
        expanded
          ? `${expandedBorder} shadow-md`
          : "border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300"
      } ${loading ? "" : "cursor-pointer"}`}
    >
      {/* Author row */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-shrink-0">
          <Avatar seed={avatarSeed} size={22} />
        </div>
        <span className="text-xs font-semibold text-gray-900 truncate">{name}</span>
        {subtitle && (
          <span className="text-[10px] uppercase tracking-wide text-gray-400 flex-shrink-0">
            {subtitle}
          </span>
        )}
        {meta && (
          <span className={`ml-auto flex-shrink-0 text-[11px] font-semibold ${meta.text}`}>
            {meta.label}
          </span>
        )}
      </div>

      {/* Response-type sub-label (paper taxonomy) */}
      {typeMeta && (
        <div className="mt-1.5">
          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${typeBadge}`}>
            {typeMeta.label}
          </span>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="mt-2 flex items-center gap-1 text-gray-400">
          <span className="animate-pulse">●</span>
          <span className="animate-pulse delay-75">●</span>
          <span className="animate-pulse delay-150">●</span>
          <span className="text-xs ml-1.5">Writing feedback...</span>
        </div>
      ) : expanded ? (
        <div className="mt-2 text-xs text-gray-800 leading-relaxed max-h-60 overflow-y-auto">
          <ReactMarkdown
            components={{
              p: (props) => <p className="mb-2 last:mb-0" {...props} />,
              ul: (props) => <ul className="list-disc list-inside mb-2 space-y-0.5" {...props} />,
              ol: (props) => <ol className="list-decimal list-inside mb-2 space-y-0.5" {...props} />,
              li: (props) => <li {...props} />,
              strong: (props) => <strong className="font-semibold text-gray-900" {...props} />,
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-gray-600 line-clamp-2">{text}</p>
      )}
    </div>
  );
}
