"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useScenarioStore } from "./store/useScenarioStore";

export default function Home() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();
  const { setIsAdmin, setAuthenticated, scenarios } = useScenarioStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "admin") {
      setIsAdmin(true);
      setAuthenticated(true);
      router.push("/admin");
    } else if (password === "vtcg") {
      setIsAdmin(false);
      setAuthenticated(true);
      router.push(`/chat/${scenarios[0].slug}`);
    } else {
      setError(true);
      setPassword("");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <main className="text-center space-y-8 p-8">
        <h1 className="text-5xl font-bold text-gray-900">
          Rylai
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl">
          Educational intervention about online unwanted sexual solicitations
        </p>
        <form onSubmit={handleSubmit} className="pt-4 space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              placeholder="Enter password"
              className={`px-6 py-3 border rounded-full text-center focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                error ? "border-red-500 ring-2 ring-red-200" : "border-gray-300"
              }`}
            />
            {error && (
              <p className="text-red-500 text-sm mt-2">Incorrect password</p>
            )}
          </div>
          <button
            type="submit"
            className="px-8 py-4 bg-purple-600 text-white rounded-full font-semibold hover:bg-purple-700 transition-colors"
          >
            Start Chat Scenario
          </button>
        </form>
      </main>
    </div>
  );
}
