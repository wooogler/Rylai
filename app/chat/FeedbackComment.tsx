"use client";

import { useState, type ComponentProps } from "react";
import Avatar from "./Avatar";
import ReactMarkdown from "react-markdown";
import { CLASSIFICATION_META, RESPONSE_TYPE_META, type ResponseLabel, type ResponseType } from "../store/useScenarioStore";
import { parseFeedback, feedbackSummary, FEEDBACK_TAB_LABELS, type FeedbackPartKey } from "@/lib/feedback-format";

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

const MD_COMPONENTS = {
  p: (props: ComponentProps<"p">) => <p className="mb-2 last:mb-0" {...props} />,
  ul: (props: ComponentProps<"ul">) => <ul className="list-disc list-inside mb-2 space-y-0.5" {...props} />,
  ol: (props: ComponentProps<"ol">) => <ol className="list-decimal list-inside mb-2 space-y-0.5" {...props} />,
  li: (props: ComponentProps<"li">) => <li {...props} />,
  strong: (props: ComponentProps<"strong">) => <strong className="font-semibold text-gray-900" {...props} />,
};

function Body({ text }: { text: string }) {
  const parsed = parseFeedback(text);
  const [tab, setTab] = useState(0);

  if (parsed.kind === "legacy") {
    return <ReactMarkdown components={MD_COMPONENTS}>{parsed.text}</ReactMarkdown>;
  }

  if (parsed.parts.length === 0) return null;

  if (parsed.mode === "tabs") {
    const active = parsed.parts[Math.min(tab, parsed.parts.length - 1)];
    return (
      <div>
        {/* Single-line segmented control (short labels so it never wraps in the narrow card) */}
        <div className="mb-2.5 flex rounded-lg bg-gray-100 p-0.5 text-[11px] font-medium">
          {parsed.parts.map((p, i) => (
            <button
              key={p.key}
              onClick={(e) => { e.stopPropagation(); setTab(i); }}
              className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-1 transition-colors ${
                i === tab ? "bg-white text-purple-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {FEEDBACK_TAB_LABELS[p.key as FeedbackPartKey] ?? p.label}
            </button>
          ))}
        </div>
        <ReactMarkdown components={MD_COMPONENTS}>{active.text}</ReactMarkdown>
      </div>
    );
  }

  // Collective: bold label, then the part text, stacked.
  return (
    <div className="space-y-2">
      {parsed.parts.map((p) => (
        <div key={p.key}>
          <span className="font-semibold text-gray-900">{p.label}:</span>{" "}
          <span className="inline">
            <ReactMarkdown components={{ ...MD_COMPONENTS, p: (props) => <span {...props} /> }}>{p.text}</ReactMarkdown>
          </span>
        </div>
      ))}
    </div>
  );
}

// A Google Docs-style comment card, anchored next to the message it evaluates.
// Collapsed: author + classification + a short summary. Click to expand/collapse.
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
        // Show the whole feedback (incl. "How to Respond Next") without an inner scroll; the
        // gutter keeps the focused card on-screen (recomputeCommentPositions). The generous
        // viewport cap only engages on very short screens, to scroll instead of hard-clip.
        <div className="mt-2 text-xs text-gray-800 leading-relaxed max-h-[70vh] overflow-y-auto">
          <Body text={text} />
        </div>
      ) : (
        <p className={`mt-1.5 text-xs text-gray-600 ${typeMeta ? "line-clamp-1" : "line-clamp-2"}`}>{feedbackSummary(text)}</p>
      )}
    </div>
  );
}
