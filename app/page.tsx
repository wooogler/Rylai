"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useScenarioStore } from "./store/useScenarioStore";
import { validatePassword } from "@/lib/validation/auth";
import Image from "next/image";

type Mode = "login" | "signup";

// Invite-link state: resolved from the ?code= param via /api/access-codes/lookup. When a
// valid unused code is present, the signup form pre-applies the code + educator so a
// participant only enters a username and password (§6, L101–102 invite flow).
interface Invite {
  code: string;
  status: "valid" | "used" | "invalid";
  educatorUsername: string | null;
}

export default function Home() {
  const router = useRouter();
  const { setAuthUser, loadUserScenarios, isAuthenticated, isAdmin, authHydrated } = useScenarioStore();

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passcode, setPasscode] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // When arriving from an educator-dedicated URL (/<educator>), we remember it here and route
  // learners back to it after auth (so they land in that educator's scenarios). §6, L96–97.
  const [educatorParam, setEducatorParam] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const e = search.get("educator");
    if (e) setEducatorParam(e);

    // Invite link: look the code up, pre-fill it, and jump straight to Sign Up.
    const code = search.get("code")?.trim();
    if (!code) return;
    setMode("signup");
    setAccessCode(code);
    (async () => {
      try {
        const res = await fetch(`/api/access-codes/lookup?code=${encodeURIComponent(code)}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "lookup failed");
        const status: Invite["status"] = !d.found ? "invalid" : d.used ? "used" : "valid";
        setInvite({ code, status, educatorUsername: d.educatorUsername ?? null });
        // The code's educator is authoritative for post-signup routing (it defines the
        // study enrollment), even if the URL's educator segment disagrees.
        if (status === "valid" && d.educatorUsername) setEducatorParam(d.educatorUsername);
      } catch (err) {
        console.error("Invite code lookup failed:", err);
        setInvite({ code, status: "invalid", educatorUsername: null });
      }
    })();
  }, []);

  const learnerLanding = () =>
    educatorParam ? `/${encodeURIComponent(educatorParam)}` : "/select-user";

  // If already logged in (cookie session), skip the form.
  useEffect(() => {
    if (authHydrated && isAuthenticated) {
      router.replace(isAdmin ? "/admin" : learnerLanding());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHydrated, isAuthenticated, isAdmin, educatorParam, router]);

  const goToLanding = async (userType: "admin" | "user") => {
    if (userType === "admin") {
      await loadUserScenarios();
      router.push("/admin");
    } else {
      router.push(learnerLanding());
    }
  };

  const handleSubmit = async () => {
    setError(null);

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
          ? { username: username.trim(), password }
          : {
              username: username.trim(),
              password,
              passcode: passcode.trim() || undefined,
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

      // Learner signup with a manually-typed access code: bind them to the code's educator
      // (invite links already do this), so they skip the teacher picker entirely. The lookup
      // still resolves after the code was consumed by this very signup.
      let learnerTarget = educatorParam;
      if (mode === "signup" && data.user.userType === "user" && !learnerTarget && accessCode.trim()) {
        try {
          const lr = await fetch(`/api/access-codes/lookup?code=${encodeURIComponent(accessCode.trim())}`);
          const ld = await lr.json();
          if (lr.ok && ld.found && ld.educatorUsername) learnerTarget = ld.educatorUsername;
        } catch {
          /* fall back to the teacher picker */
        }
      }

      setAuthUser(data.user);
      if (data.user.userType === "admin") {
        await goToLanding("admin");
      } else {
        router.push(learnerTarget ? `/${encodeURIComponent(learnerTarget)}` : "/select-user");
      }
    } catch (err) {
      console.error("Auth error:", err);
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <main className="text-center space-y-8 p-8 max-w-2xl">
        <div className="flex flex-col items-center gap-4">
          <Image src="/logo.svg" alt="RYLAI Logo" width={96} height={96} />
          <h1 className="text-5xl font-bold text-gray-900">RYLAI</h1>
        </div>
        <p className="text-lg text-gray-600">
          <span className="font-bold">R</span>esilient{" "}
          <span className="font-bold">Y</span>outh{" "}
          <span className="font-bold">L</span>earn through{" "}
          <span className="font-bold">A</span>rtificial{" "}
          <span className="font-bold">I</span>ntelligence
        </p>
        <p className="text-base text-gray-700 italic">
          An educational intervention to teach teens how to be more resilient against cybergrooming.
        </p>

        <div className="bg-white rounded-2xl shadow-lg p-8 text-left">
          {/* Invite-link banner */}
          {invite && (
            invite.status === "valid" ? (
              <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900">
                You&apos;re joining{" "}
                <span className="font-semibold">{invite.educatorUsername ?? "your educator"}</span>&apos;s
                RYLAI class. Just pick a username and password to get started.
              </div>
            ) : (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {invite.status === "used"
                  ? "This invite link's access code has already been used. If that wasn't you, please contact your researcher for a new code."
                  : "This invite link's access code isn't valid. Please check with your researcher, or enter a code manually below."}
              </div>
            )
          )}

          {/* Login / Sign Up toggle */}
          <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-full">
            <button
              onClick={() => switchMode("login")}
              className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${
                mode === "login" ? "bg-white shadow text-purple-700" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => switchMode("signup")}
              className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${
                mode === "signup" ? "bg-white shadow text-purple-700" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder={mode === "signup" ? "Choose a username (2+ chars)" : "Enter your username"}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access code
                </label>
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  readOnly={invite?.status === "valid"}
                  placeholder="Enter the code your researcher gave you"
                  className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                    invite?.status === "valid" ? "bg-gray-50 text-gray-500 cursor-default" : ""
                  }`}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {invite?.status === "valid"
                    ? "Your access code was applied from the invite link."
                    : "Participants need an access code to sign up. (Educators can leave this blank and use the passcode below.)"}
                </p>
              </div>
            )}

            {mode === "signup" && !invite && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Educator passcode <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="Leave blank to register as a learner"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Educators enter the passcode provided by your administrator to create scenarios.
                </p>
              </div>
            )}

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full px-8 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
