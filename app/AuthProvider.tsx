"use client";

import { useEffect } from "react";
import { useScenarioStore } from "./store/useScenarioStore";

// Hydrates client auth state from the httpOnly session cookie (via /api/auth/me)
// once on load. The cookie — not localStorage — is the source of truth for auth.
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrateAuth = useScenarioStore((s) => s.hydrateAuth);

  useEffect(() => {
    hydrateAuth();
  }, [hydrateAuth]);

  return <>{children}</>;
}
