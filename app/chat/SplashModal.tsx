"use client";

import { X } from "lucide-react";
import Button from "@/components/Button";
import Markdown from "@/components/Markdown";

interface SplashModalProps {
  content: string;
  onStart: () => void;
}

// Scrollable splash modal shown over the chat when a learner first enters a scenario
// (Evaluation Plan §6, L123–137). Introduces the scenario and the grooming stages they may
// encounter; "Start Chatting" dismisses it. Re-openable from the chat header's ⓘ button.
export default function SplashModal({ content, onStart }: SplashModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-12 sm:pt-16">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-center justify-end border-b border-gray-100 px-4 py-2">
          <button
            onClick={onStart}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-8 py-6">
          <Markdown>{content}</Markdown>
        </div>
        <div className="border-t border-gray-100 px-8 py-4 text-right">
          <Button variant="primary" onClick={onStart}>Start Chatting</Button>
        </div>
      </div>
    </div>
  );
}
