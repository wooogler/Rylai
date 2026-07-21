"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useScenarioStore } from "../store/useScenarioStore";
import { validatePassword } from "@/lib/validation/auth";

type Mode = "signup" | "login";

interface Educator {
  id: string;
  username: string;
  age: number | null;
  hasWelcome: boolean;
  // false = an unused access code is required to join this class.
  openEnrollment: boolean;
}

type InviteStatus = "valid" | "used" | "invalid";

// The educator's distribution link — the ONLY way into a class. It is both the sign-up page
// and the login page for that educator's students, and their credentials live in this
// educator's namespace alone: the same username may exist under another educator as a
// completely separate account.
//
// `?code=` (from a per-participant invite link) pre-applies an access code. A class whose
// educator turned off open enrollment can only be joined that way.
//
// Static routes (/admin, /chat, …) take precedence, so this only catches otherwise-unmatched
// single-segment paths.
export default function EducatorLandingPage() {
  const router = useRouter();
  const params = useParams();
  const educatorUsername = decodeURIComponent((params.educator as string) || "");
  const {
    authHydrated,
    isAuthenticated,
    userType,
    adminUserId,
    currentUser,
    setAuthUser,
    loadUserScenarios,
    logout,
  } = useScenarioStore();

  const [educator, setEducator] = useState<Educator | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [entering, setEntering] = useState(false);
  const [emptyClass, setEmptyClass] = useState(false);

  const [mode, setMode] = useState<Mode>("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [inviteStatus, setInviteStatus] = useState<InviteStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resolve the educator named in the URL.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/educator?username=${encodeURIComponent(educatorUsername)}`);
        const d = res.ok ? await res.json() : { educator: null };
        if (cancelled) return;
        if (d.educator) setEducator(d.educator);
        else setNotFound(true);
      } catch (err) {
        console.error("Failed to resolve educator:", err);
        if (!cancelled) setNotFound(true);
      }
    })();
    return () => { cancelled = true; };
  }, [educatorUsername]);

  // An invite link carries a code: pre-fill it, validate it against THIS class, and open the
  // sign-up tab.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code")?.trim();
    if (!code || !educator) return;
    setMode("signup");
    setAccessCode(code);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/access-codes/lookup?code=${encodeURIComponent(code)}&educator=${encodeURIComponent(educator.username)}`
        );
        const d = await res.json();
        if (!cancelled) setInviteStatus((d.status as InviteStatus) ?? "invalid");
      } catch (err) {
        console.error("Invite code lookup failed:", err);
        if (!cancelled) setInviteStatus("invalid");
      }
    })();
    return () => { cancelled = true; };
  }, [educator]);

  // Signed-in member of this class: load the scenarios and go straight in. Guarded because
  // both a fresh sign-in and the auth effect below can trigger it for the same visit.
  const enteredRef = useRef(false);
  const enterClass = useCallback(async () => {
    if (!educator || enteredRef.current) return;
    enteredRef.current = true;
    setEntering(true);
    await loadUserScenarios();
    const scenarios = useScenarioStore.getState().scenarios;
    if (scenarios.length === 0) {
      enteredRef.current = false;
      setEmptyClass(true);
      setEntering(false);
      return;
    }
    router.replace(educator.hasWelcome ? "/welcome" : `/chat/${scenarios[0].slug}`);
  }, [educator, loadUserScenarios, router]);

  // Authenticated visitors: educators go to their own admin; a student of THIS class goes
  // straight into it. A student of a *different* class is left on the form (see the banner
  // below) — visiting a link must never silently re-bind an account to another educator.
  useEffect(() => {
    if (!authHydrated || !educator || !isAuthenticated) return;
    if (userType === "admin") {
      router.replace("/admin");
      return;
    }
    if (adminUserId === educator.id) enterClass();
  }, [authHydrated, isAuthenticated, userType, adminUserId, educator, router, enterClass]);

  const handleSubmit = async () => {
    setError(null);
    if (!educator) return;

    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }
    if (mode === "signup") {
      if (username.trim().length < 2) {
        setError("Username must be at least 2 characters.");
        return;
      }
      const pw = validatePassword(password);
      if (!pw.valid) {
        setError(pw.error || "Invalid password.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body =
        mode === "login"
          ? { username: username.trim(), password, educator: educator.username }
          : {
              username: username.trim(),
              password,
              educator: educator.username,
              accessCode: accessCode.trim() || undefined,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setAuthUser(data.user);
      await enterClass();
    } catch (err) {
      console.error("Auth error:", err);
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center">
        <p className="text-gray-700">
          We couldn&apos;t find a class at <span className="font-semibold">{educatorUsername}</span>.
        </p>
        <p className="text-sm text-gray-500">
          Double-check the link your educator gave you.
        </p>
        <Link href="/" className="text-sm font-medium text-purple-600 hover:text-purple-800">
          Go to the home page
        </Link>
      </div>
    );
  }

  if (!educator || entering) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (emptyClass) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center">
        <p className="text-gray-700">
          This class doesn&apos;t have any scenarios yet.
        </p>
        <p className="text-sm text-gray-500">Check back once your educator sets them up.</p>
      </div>
    );
  }

  // Signed in, but to a different educator's class. Their account cannot be carried over.
  const wrongClass = isAuthenticated && userType === "user" && adminUserId !== educator.id;
  const codeRequired = !educator.openEnrollment;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-purple-50 to-white p-6">
      <main className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/logo.svg" alt="RYLAI Logo" width={64} height={64} />
          {/* No educator name here (or anywhere a learner can see) — every class page reads
              the same, even though the URL segment is still the educator's username. */}
          <h1 className="text-2xl font-bold text-gray-900">RYLAI class</h1>
          <p className="text-sm text-gray-600">
            Practice spotting and responding to online grooming, safely.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-lg">
          {wrongClass && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              You&apos;re signed in as <span className="font-semibold">{currentUser}</span> in a
              different class. Accounts belong to one class only.
              <button
                onClick={async () => {
                  await logout();
                  setError(null);
                }}
                className="mt-2 block font-semibold text-amber-900 underline"
              >
                Log out to continue here
              </button>
            </div>
          )}

          {inviteStatus && (
            inviteStatus === "valid" ? (
              <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900">
                Your invite code was applied. Just pick a username and password to get started.
              </div>
            ) : (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {inviteStatus === "used"
                  ? "This invite link's access code has already been used. If that wasn't you, please ask your educator for a new one."
                  : "This invite link's access code isn't valid for this class. Please check with your educator."}
              </div>
            )
          )}

          {/* Sign Up / Login toggle */}
          <div className="mb-6 flex gap-2 rounded-full bg-gray-100 p-1">
            <button
              onClick={() => { setMode("signup"); setError(null); }}
              className={`flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
                mode === "signup" ? "bg-white text-purple-700 shadow" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Sign Up
            </button>
            <button
              onClick={() => { setMode("login"); setError(null); }}
              className={`flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
                mode === "login" ? "bg-white text-purple-700 shadow" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Login
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                disabled={wrongClass}
                placeholder={mode === "signup" ? "Choose a username (2+ chars)" : "Enter your username"}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                disabled={wrongClass}
                placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
              />
            </div>

            {mode === "signup" && (codeRequired || accessCode) && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Access code{" "}
                  {!codeRequired && <span className="font-normal text-gray-400">(optional)</span>}
                </label>
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  disabled={wrongClass}
                  readOnly={inviteStatus === "valid"}
                  placeholder="Enter the code your educator gave you"
                  className={`w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50 ${
                    inviteStatus === "valid" ? "cursor-default bg-gray-50 text-gray-500" : ""
                  }`}
                />
                {codeRequired && !inviteStatus && (
                  <p className="mt-1 text-xs text-gray-500">
                    This class requires an access code to join.
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || wrongClass}
              className="w-full rounded-lg bg-purple-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Please wait..." : mode === "signup" ? "Create account" : "Login"}
            </button>
          </div>

          <p className="mt-6 border-t border-gray-100 pt-4 text-center text-xs text-gray-500">
            {mode === "signup"
              ? "Already joined this class? Switch to Login."
              : "New here? Switch to Sign Up to join this class."}
          </p>
        </div>
      </main>
    </div>
  );
}
