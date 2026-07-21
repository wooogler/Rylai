"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useScenarioStore } from "./store/useScenarioStore";
import { validatePassword } from "@/lib/validation/auth";
import Image from "next/image";

type Mode = "login" | "signup";

// Educator entry point. Students never sign in here — they can only sign up and log in
// through their educator's distribution link (`/<educatorUsername>`), which is also the only
// place their credentials exist (usernames are scoped per educator). A student who does land
// here while signed in is bounced to their own class page.
export default function Home() {
  const router = useRouter();
  const { setAuthUser, loadUserScenarios, isAuthenticated, isAdmin, authHydrated, adminName } =
    useScenarioStore();

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in (cookie session), skip the form.
  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return;
    if (isAdmin) {
      router.replace("/admin");
    } else if (adminName) {
      router.replace(`/${encodeURIComponent(adminName)}`);
    }
  }, [authHydrated, isAuthenticated, isAdmin, adminName, router]);

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
      if (!passcode.trim()) {
        setError("The educator passcode is required to create an account.");
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
          : { username: username.trim(), password, passcode: passcode.trim() };

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
      await loadUserScenarios();
      router.push("/admin");
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
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Educator sign in</h2>
            <p className="text-sm text-gray-500 mt-1">
              This page is for educators. Students join through the class link their educator
              shares with them.
            </p>
          </div>

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
              {mode === "signup" && (
                <p className="text-xs text-gray-500 mt-1">
                  This also becomes your class link: rylai.cs.vt.edu/
                  <span className="font-mono">{username.trim() || "your-username"}</span>
                </p>
              )}
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
                  Educator passcode
                </label>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="Provided by your administrator"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Required — only educators can create accounts here.
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

          <p className="mt-6 border-t border-gray-100 pt-4 text-center text-xs text-gray-500">
            Are you a student? Open the class link your educator gave you — your account only
            exists inside their class.
          </p>
        </div>
      </main>
    </div>
  );
}
