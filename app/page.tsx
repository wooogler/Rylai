"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useScenarioStore } from "./store/useScenarioStore";
import { supabase } from "@/lib/supabase";

type ButtonState = "start" | "user" | "existing" | "new";

export default function Home() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState(false);
  const [buttonState, setButtonState] = useState<ButtonState>("start");
  const [isChecking, setIsChecking] = useState(false);
  const router = useRouter();
  const { setCurrentUser, loadUserScenarios } = useScenarioStore();

  const handleStart = async () => {
    if (!username.trim()) {
      setError(true);
      return;
    }

    const inputUsername = username.trim();
    setIsChecking(true);

    try {
      // Check if username is "user"
      if (inputUsername === "user") {
        setButtonState("user");
        setIsChecking(false);
        return;
      }

      // Check if username exists in DB
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('username', inputUsername)
        .single();

      if (data && !error) {
        setButtonState("existing");
      } else {
        setButtonState("new");
      }
    } catch {
      setButtonState("new");
    } finally {
      setIsChecking(false);
    }
  };

  const handleCancel = () => {
    setButtonState("start");
    setError(false);
  };

  const handleProceed = async () => {
    const inputUsername = username.trim();

    try {
      if (buttonState === "user") {
        router.push("/select-user");
      } else {
        await setCurrentUser(inputUsername);
        await loadUserScenarios();
        router.push("/admin");
      }
    } catch (err) {
      console.error("Error:", err);
      setError(true);
    }
  };

  const getButtonText = () => {
    switch (buttonState) {
      case "user":
        return "Start Chat Scenario";
      case "existing":
        return "Edit Scenarios";
      case "new":
        return "Create Scenarios";
      default:
        return "Start";
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <main className="text-center space-y-8 p-8">
        <h1 className="text-5xl font-bold text-gray-900">
          RYLAI
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl">
          Resilient Youth Learn through Artificial Intelligence
        </p>
        <div className="pt-4 space-y-4">
          <div>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(false);
              }}
              placeholder="Enter your username"
              disabled={buttonState !== "start"}
              className={`px-6 py-3 border rounded-full text-center focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                error ? "border-red-500 ring-2 ring-red-200" : "border-gray-300"
              } ${buttonState !== "start" ? "bg-gray-100" : ""}`}
            />
            {error && (
              <p className="text-red-500 text-sm mt-2">Please enter a username</p>
            )}
          </div>

          <div className="flex gap-3 justify-center">
            {buttonState !== "start" && (
              <button
                onClick={handleCancel}
                className="px-8 py-4 bg-gray-500 text-white rounded-full font-semibold hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={buttonState === "start" ? handleStart : handleProceed}
              disabled={isChecking}
              className="px-8 py-4 bg-purple-600 text-white rounded-full font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isChecking ? "Checking..." : getButtonText()}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
