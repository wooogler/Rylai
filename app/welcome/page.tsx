"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useScenarioStore } from "../store/useScenarioStore";
import Button from "@/components/Button";
import Markdown from "@/components/Markdown";

// Learner-facing Welcome screen (Evaluation Plan §6, L105–121): shown when a learner enters
// their class and before the first scenario. Renders the educator's welcome markdown, with a
// "Let's Begin" button into the first scenario. If the educator has no welcome content, it
// skips straight to the first scenario (so direct navigation / refresh stays graceful).
export default function WelcomePage() {
  const router = useRouter();
  const { authHydrated, isAuthenticated, userType, adminName, loadUserScenarios } = useScenarioStore();
  const [content, setContent] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [emptyClass, setEmptyClass] = useState(false);

  useEffect(() => {
    if (!authHydrated) return;
    // Unauthenticated learners belong on their class page, which is where they log in.
    if (!isAuthenticated) { router.push(adminName ? `/${encodeURIComponent(adminName)}` : "/"); return; }
    if (userType === "admin") { router.push("/admin"); return; }

    let cancelled = false;
    (async () => {
      if (useScenarioStore.getState().scenarios.length === 0) {
        await loadUserScenarios();
      }

      let md = "";
      try {
        // The educator is resolved server-side from the session — the client never names it.
        const res = await fetch("/api/get-admin-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const { adminUser } = await res.json();
          md = (adminUser?.welcomeMarkdown ?? "").trim();
        }
      } catch (err) {
        console.error("Failed to load welcome content:", err);
      }

      if (cancelled) return;
      const list = useScenarioStore.getState().scenarios;
      if (list.length === 0) { setEmptyClass(true); setReady(true); return; }
      if (!md) {
        router.replace(`/chat/${list[0].slug}`);
        return;
      }
      setContent(md);
      setReady(true);
    })();

    return () => { cancelled = true; };
  }, [authHydrated, isAuthenticated, userType, adminName, router, loadUserScenarios]);

  const handleBegin = () => {
    const list = useScenarioStore.getState().scenarios;
    if (list.length > 0) router.push(`/chat/${list[0].slug}`);
  };

  if (ready && emptyClass) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-gray-50 p-6 text-center">
        <p className="text-gray-700">This class doesn&apos;t have any scenarios yet.</p>
        <p className="text-sm text-gray-500">Check back once your educator sets them up.</p>
      </div>
    );
  }

  if (!ready || content === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Welcome to <span className="text-purple-600">RYLAI</span>
          </h1>
          <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-purple-500" />
        </div>
        <Markdown>{content}</Markdown>
        <div className="mt-8 flex justify-center">
          <Button variant="primary" onClick={handleBegin}>Let&apos;s Begin</Button>
        </div>
      </div>
    </div>
  );
}
