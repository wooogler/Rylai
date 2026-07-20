"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useScenarioStore } from "../store/useScenarioStore";
import Button from "@/components/Button";
import Markdown from "@/components/Markdown";
import { DEFAULT_CLOSING_MARKDOWN } from "@/lib/welcome-content";

// Learner-facing Closing screen: shown when a learner finishes the last scenario (the chat's
// "Finish" action). Renders the educator's closing markdown — or a built-in default if they
// left it empty — so every learner gets a clear, non-destructive ending (no "Reset to start
// over" nudge). Mirrors the Welcome screen (app/welcome/page.tsx).
export default function CompletePage() {
  const router = useRouter();
  const { authHydrated, isAuthenticated, userType, adminUserId, logout } = useScenarioStore();
  const [content, setContent] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) { router.push("/"); return; }
    if (userType === "admin") { router.push("/admin"); return; }

    let cancelled = false;
    (async () => {
      let md = "";
      // Learners don't carry the educator's closing markdown in their own store, so fetch it
      // the same way the welcome screen fetches the welcome markdown.
      if (adminUserId) {
        try {
          const res = await fetch("/api/get-admin-info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adminId: adminUserId }),
          });
          if (res.ok) {
            const { adminUser } = await res.json();
            md = (adminUser?.closingMarkdown ?? "").trim();
          }
        } catch (err) {
          console.error("Failed to load closing content:", err);
        }
      }
      if (cancelled) return;
      setContent(md || DEFAULT_CLOSING_MARKDOWN);
      setReady(true);
    })();

    return () => { cancelled = true; };
  }, [authHydrated, isAuthenticated, userType, adminUserId, router]);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

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
        <Markdown>{content}</Markdown>
        <div className="mt-8 flex justify-center">
          <Button variant="primary" onClick={handleLogout}>Log out</Button>
        </div>
      </div>
    </div>
  );
}
