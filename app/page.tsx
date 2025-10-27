"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useScenarioStore } from "./store/useScenarioStore";
import { supabase } from "@/lib/supabase";

const PASSWORD = "rylai2025";

type ButtonState = "start" | "user" | "existing" | "new";

export default function Home() {
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState(false);
  const [buttonState, setButtonState] = useState<ButtonState>("start");
  const [isChecking, setIsChecking] = useState(false);
  const router = useRouter();
  const { setCurrentUser, loadUserScenarios } = useScenarioStore();

  const handleStart = async () => {
    // Check both password and username
    let hasError = false;

    if (password !== PASSWORD) {
      setPasswordError(true);
      hasError = true;
    }

    if (!username.trim()) {
      setUsernameError(true);
      hasError = true;
    }

    if (hasError) {
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
    setPasswordError(false);
    setUsernameError(false);
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
      setUsernameError(true);
    }
  };

  const getButtonText = () => {
    switch (buttonState) {
      case "user":
        return "Start Chatting";
      case "existing":
        return "Edit Settings";
      case "new":
        return "Create New Settings";
      default:
        return "Start";
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <main className="text-center space-y-8 p-8 max-w-4xl">
        <h1 className="text-5xl font-bold text-gray-900">
          RYLAI
        </h1>
        <p className="text-xl text-gray-600">
          <span className="font-bold">R</span>esilient{" "}
          <span className="font-bold">Y</span>outh{" "}
          <span className="font-bold">L</span>earn through{" "}
          <span className="font-bold">A</span>rtificial{" "}
          <span className="font-bold">I</span>ntelligence
        </p>

        <div className="bg-white rounded-lg shadow-lg p-6 text-left space-y-4">
          <h2 className="text-2xl font-bold text-purple-700 text-center">
            Interactive Training Platform
          </h2>
          <p className="text-gray-700 leading-relaxed">
            RYLAI is an AI-powered educational platform designed to help youth recognize and respond to online grooming tactics.
            Through realistic conversation simulations, learners can practice identifying red flags and developing safe online communication skills.
          </p>

          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-900 mb-2">Features:</h3>
            <ul className="text-gray-700 space-y-2 list-disc list-inside">
              <li>7 scenarios covering different stages of grooming tactics</li>
              <li>Real-time AI-powered predator simulation</li>
              <li>Personalized feedback on conversation responses</li>
              <li>Safe, controlled learning environment</li>
            </ul>
          </div>

          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-purple-900">
              <span className="font-semibold">For Educators:</span> Use username &quot;user&quot; to access all scenarios.
              <br />
              <span className="font-semibold">For Learners:</span> Enter your unique username to start training.
            </p>
          </div>
        </div>

        <div className="pt-4 space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(false);
              }}
              placeholder="Enter password"
              disabled={buttonState !== "start"}
              className={`px-6 py-3 border rounded-full text-center focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                passwordError ? "border-red-500 ring-2 ring-red-200" : "border-gray-300"
              } ${buttonState !== "start" ? "bg-gray-100" : ""}`}
            />
            {passwordError && (
              <p className="text-red-500 text-sm mt-2">Incorrect password</p>
            )}
          </div>
          <div>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setUsernameError(false);
              }}
              placeholder="Enter your username"
              disabled={buttonState !== "start"}
              className={`px-6 py-3 border rounded-full text-center focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                usernameError ? "border-red-500 ring-2 ring-red-200" : "border-gray-300"
              } ${buttonState !== "start" ? "bg-gray-100" : ""}`}
            />
            {usernameError && (
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
