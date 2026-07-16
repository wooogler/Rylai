"use client";

import Button from "@/components/Button";
import { PartyPopper } from "lucide-react";

interface CongratsModalProps {
  targetPct: number;
  // Final scenario? Then the second action ends the conversation instead of advancing.
  isLast: boolean;
  onContinue: () => void;
  onNext: () => void;
  onEnd: () => void;
}

// Shown once, the first time the learner reaches the scenario's Protective Response Rate
// target (§6, L146 / L171). The system never auto-advances — the learner explicitly chooses
// to keep practicing, move to the next scenario, or (on the last scenario) end the chat.
export default function CongratsModal({ targetPct, isLast, onContinue, onNext, onEnd }: CongratsModalProps) {
  const tail = isLast ? "end the conversation" : "move to the next scenario";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-24">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-center gap-3 bg-emerald-50 px-6 py-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100">
            <PartyPopper className="h-6 w-6 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-emerald-800">Nice work!</h2>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm leading-relaxed text-gray-700">
            Congratulations, you have reached <span className="font-semibold">{targetPct}%</span> of the
            protective response rate. You can either continue chatting within this scenario or {tail}.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onContinue}>Continue Chatting</Button>
            {isLast ? (
              <Button variant="primary" onClick={onEnd}>End Chat</Button>
            ) : (
              <Button variant="primary" onClick={onNext}>Next Scenario</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
