// Persistent withdraw/discomfort notice shown as a footer on every page with the predator
// chatbot (Evaluation Plan §6, L118–119). Kept low-key so it doesn't disrupt the chat, but
// always visible so learners know they can stop at any time.
export default function DisclaimerFooter() {
  return (
    <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-gray-400">
      If any part of this conversation makes you feel uncomfortable or unsafe and you&apos;d like to
      stop, you may discontinue at any time without penalty.
    </p>
  );
}
