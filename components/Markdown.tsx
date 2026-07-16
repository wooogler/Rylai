"use client";

import ReactMarkdown from "react-markdown";

// Shared Markdown renderer for educator-authored content (welcome screen, scenario splash).
// Styling matches the app's neutral prose; no external stylesheet needed.
export default function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`text-sm leading-relaxed text-gray-700 ${className}`}>
      <ReactMarkdown
        components={{
          h1: (props) => <h1 className="mt-4 mb-2 text-xl font-bold text-gray-900 first:mt-0" {...props} />,
          h2: (props) => <h2 className="mt-4 mb-2 text-lg font-bold text-gray-900 first:mt-0" {...props} />,
          h3: (props) => <h3 className="mt-3 mb-1.5 text-base font-semibold text-gray-900" {...props} />,
          p: (props) => <p className="mb-3 last:mb-0" {...props} />,
          ul: (props) => <ul className="mb-3 list-outside list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="mb-3 list-outside list-decimal space-y-1 pl-5" {...props} />,
          li: (props) => <li {...props} />,
          strong: (props) => <strong className="font-semibold text-gray-900" {...props} />,
          em: (props) => <em className="italic" {...props} />,
          blockquote: (props) => (
            <blockquote className="my-3 border-l-4 border-gray-200 pl-3 italic text-gray-600" {...props} />
          ),
          a: (props) => <a className="text-purple-600 underline" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
