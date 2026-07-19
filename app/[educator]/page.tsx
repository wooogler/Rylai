"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useScenarioStore } from "../store/useScenarioStore";

// Educator-dedicated URL (Evaluation Plan §6, L96–97): rylai.…/<educatorUsername>. A learner
// lands here and is placed directly into that educator's scenarios — no educator list to
// choose from. Unauthenticated visitors are sent to sign up (remembering the educator);
// educators are sent to their own admin. Static routes (/admin, /chat, …) take precedence, so
// this only catches otherwise-unmatched single-segment paths.
export default function EducatorLandingPage() {
  const router = useRouter();
  const params = useParams();
  const username = decodeURIComponent((params.educator as string) || "");
  const { authHydrated, isAuthenticated, userType, setAdminContext, loadUserScenarios } = useScenarioStore();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!authHydrated) return;
    let cancelled = false;

    (async () => {
      let educator: { id: string; username: string; age: number | null; hasWelcome: boolean } | null = null;
      try {
        const res = await fetch(`/api/educator?username=${encodeURIComponent(username)}`);
        if (res.ok) {
          const d = await res.json();
          educator = d.educator ?? null;
        }
      } catch (err) {
        console.error("Failed to resolve educator:", err);
      }
      if (cancelled) return;

      if (!educator) {
        setNotFound(true);
        return;
      }

      if (!isAuthenticated) {
        // Remember this educator through the sign-up / login flow. An invite link may also
        // carry an access code (?code=...) — pass it along so the signup form pre-applies it.
        const inviteCode = new URLSearchParams(window.location.search).get("code");
        const codePart = inviteCode ? `&code=${encodeURIComponent(inviteCode)}` : "";
        router.replace(`/?educator=${encodeURIComponent(username)}${codePart}`);
        return;
      }
      if (userType === "admin") {
        router.replace("/admin");
        return;
      }

      // Authenticated learner: adopt this educator's context and go straight in.
      setAdminContext(educator.id, educator.age, educator.username);
      await loadUserScenarios();
      if (cancelled) return;
      const scenarios = useScenarioStore.getState().scenarios;
      if (scenarios.length === 0) {
        setNotFound(true);
        return;
      }
      router.replace(educator.hasWelcome ? "/welcome" : `/chat/${scenarios[0].slug}`);
    })();

    return () => { cancelled = true; };
  }, [authHydrated, isAuthenticated, userType, username, router, setAdminContext, loadUserScenarios]);

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center">
        <p className="text-gray-700">
          We couldn&apos;t find an educator called <span className="font-semibold">{username}</span>.
        </p>
        <Link href="/" className="text-sm font-medium text-purple-600 hover:text-purple-800">
          Go to the home page
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-400">
      Loading…
    </div>
  );
}
