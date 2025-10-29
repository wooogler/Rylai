"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useScenarioStore } from "./store/useScenarioStore";
import { supabase } from "@/lib/supabase";
import Image from "next/image";

const ADMIN_PASSWORD = "rylai2025";
const USER_PASSWORD = "user2025";

type ButtonState = "start" | "existing" | "new";
type UserType = "admin" | "user";

export default function Home() {
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState(false);
  const [buttonState, setButtonState] = useState<ButtonState>("start");
  const [isChecking, setIsChecking] = useState(false);
  const [userType, setUserType] = useState<UserType | null>(null);
  const router = useRouter();
  const { setCurrentUser, loadUserScenarios } = useScenarioStore();

  const handleStart = async () => {
    // Check both password and username
    let hasError = false;

    // Determine user type based on password
    let detectedUserType: UserType | null = null;
    if (password === ADMIN_PASSWORD) {
      detectedUserType = "admin";
    } else if (password === USER_PASSWORD) {
      detectedUserType = "user";
    } else {
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

    setUserType(detectedUserType);
    const inputUsername = username.trim();
    setIsChecking(true);

    try {
      // Check if username exists in DB
      const { data, error } = await supabase
        .from('users')
        .select('id, user_type')
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
      // Pass userType to setCurrentUser
      await setCurrentUser(inputUsername, userType || "user");
      await loadUserScenarios();

      // User type: go to select-user to choose which admin's scenarios to use
      // Admin type: go directly to chat
      if (userType === "user") {
        router.push("/select-user");
      } else {
        router.push("/chat/stage-1-friendship");
      }
    } catch (err) {
      console.error("Error:", err);
      setUsernameError(true);
    }
  };

  const getButtonText = () => {
    switch (buttonState) {
      case "existing":
        return "Login";
      case "new":
        return "Create a chat";
      default:
        return "Start";
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <main className="text-center space-y-8 p-8 max-w-4xl">
        <div className="flex flex-col items-center gap-4">
          <Image src="/logo.svg" alt="RYLAI Logo" width={96} height={96} />
          <h1 className="text-5xl font-bold text-gray-900">
            RYLAI
          </h1>
        </div>
        <p className="text-xl text-gray-600">
          <span className="font-bold">R</span>esilient{" "}
          <span className="font-bold">Y</span>outh{" "}
          <span className="font-bold">L</span>earn through{" "}
          <span className="font-bold">A</span>rtificial{" "}
          <span className="font-bold">I</span>ntelligence
        </p>
        <p className="text-lg text-gray-700 italic">
          An educational intervention to teach teens how to be more resilient against cybergrooming.
        </p>

        <div className="bg-white rounded-lg shadow-lg p-6 text-left space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Features:</h3>
            <ul className="text-gray-700 space-y-2 list-disc list-inside">
              <li>Real-time AI-powered predator simulation</li>
              <li>Personalized feedback on conversation responses</li>
              <li>Safe, controlled learning environment</li>
            </ul>
          </div>

          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-purple-900">
              <span className="font-semibold">For Educators:</span> Use password &quot;rylai2025&quot; to create and manage scenarios.
              <br />
              <span className="font-semibold">For Learners:</span> Use password &quot;user2025&quot; to practice with educator scenarios.
            </p>
          </div>
        </div>

        <div className="pt-4 space-y-4">
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
