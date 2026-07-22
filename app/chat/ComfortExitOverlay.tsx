"use client";

import Button from "@/components/Button";
import { DoorOpen } from "lucide-react";

interface ComfortExitOverlayProps {
  // Wrap up the whole session now: skip any remaining scenarios, go to the closing screen.
  onFinish: () => void;
  // Stay here instead, with the conversation closed but readable.
  onDismiss: () => void;
  // Scenarios that finishing now would skip. 0 = this was the last one, so nothing is lost.
  remainingCount: number;
  // Present only for the exit the learner just made: takes the mis-click back and reopens the
  // conversation. Absent when the overlay is re-shown for an exit made earlier.
  onUndo?: () => void;
}

// Shown full-screen once a learner leaves via "I don't feel comfortable anymore." (§6, L216).
// The conversation behind it is blurred and dimmed rather than merely disabled: the exit is a
// deliberate, emotionally loaded choice, and testers reported the one-line banner under the
// chat was easy to miss.
//
// Finishing is the default action — someone who left because they felt uncomfortable should
// not have to walk back through the conversation to get out — but it is spelled out first,
// since it skips whatever scenarios are left. Staying keeps them here with the conversation
// closed but readable; only Restart reopens the input.
// Comfort exit only — finishing a scenario normally keeps its lighter inline banner.
export default function ComfortExitOverlay({
  onFinish,
  onDismiss,
  remainingCount,
  onUndo,
}: ComfortExitOverlayProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="comfort-exit-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/30 p-4 backdrop-blur-md"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white px-8 py-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
          <DoorOpen className="h-7 w-7 text-rose-500" />
        </div>
        <h2 id="comfort-exit-title" className="mt-5 text-xl font-bold text-gray-900">
          You&apos;ve ended this conversation.
        </h2>
        <p className="mt-2 text-base leading-relaxed text-gray-600">
          It&apos;s okay to step away anytime.
        </p>

        <div className="mt-7 flex flex-col gap-2">
          <Button variant="primary" onClick={onFinish} className="w-full">
            Finish and exit
          </Button>
          <Button variant="ghost" onClick={onDismiss} className="w-full justify-center">
            Stay and look back over this conversation
          </Button>
        </div>

        <p className="mt-4 text-xs leading-snug text-gray-500">
          {remainingCount > 0 ? (
            <>
              Finishing takes you straight to the closing screen and{' '}
              <span className="font-semibold text-gray-700">
                skips the {remainingCount} scenario{remainingCount === 1 ? '' : 's'} you
                haven&apos;t done yet
              </span>
              . Staying keeps this conversation closed, but you can still read your messages and
              feedback.
            </>
          ) : (
            <>
              Finishing takes you to the closing screen. Staying keeps this conversation closed,
              but you can still read your messages and feedback.
            </>
          )}
        </p>

        {onUndo && (
          <button
            onClick={onUndo}
            className="mt-4 text-xs text-gray-500 underline underline-offset-4 hover:text-gray-800"
          >
            I clicked this by mistake — go back to the conversation
          </button>
        )}
      </div>
    </div>
  );
}
