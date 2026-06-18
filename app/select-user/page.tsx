"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useScenarioStore } from "../store/useScenarioStore";
import { RotateCcw, LogOut } from "lucide-react";
import Link from "next/link";

interface Educator {
  id: string;
  username: string;
  createdAt: Date | string;
  scenarioCount: number;
  visitedCount: number;
}

export default function SelectUserPage() {
  const router = useRouter();
  const {
    setAdminContext,
    loadUserScenarios,
    resetScenarioProgress,
    logout,
    userType,
    userId,
    isAuthenticated,
    authHydrated,
  } = useScenarioStore();
  const [educators, setEducators] = useState<Educator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // Redirect once auth is known: educators belong on /admin, unauthenticated on /.
  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) {
      router.replace("/");
    } else if (userType !== "user") {
      router.replace("/admin");
    } else {
      loadEducators();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHydrated, isAuthenticated, userType, userId]);

  const loadEducators = async () => {
    try {
      const response = await fetch("/api/get-users-with-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, userType }),
      });

      if (!response.ok) throw new Error("Failed to load educators");

      const data = await response.json();
      setEducators(data.adminsWithProgress || []);
    } catch (err) {
      console.error("Error loading educators:", err);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = async (educatorId: string) => {
    try {
      setIsLoading(true);

      const response = await fetch("/api/get-admin-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: educatorId }),
      });
      if (!response.ok) throw new Error("Educator not found");

      const { adminUser } = await response.json();
      setAdminContext(adminUser.id, adminUser.age ?? null, adminUser.username ?? null);

      await loadUserScenarios();

      const scenarios = useScenarioStore.getState().scenarios;
      if (scenarios.length === 0) {
        setError(true);
        setIsLoading(false);
        return;
      }
      router.push(`/chat/${scenarios[0].slug}`);
    } catch (err) {
      console.error("Error selecting educator:", err);
      setError(true);
      setIsLoading(false);
    }
  };

  const handleResetProgress = async (e: React.MouseEvent, educatorId: string, name: string) => {
    e.stopPropagation();

    if (
      !confirm(
        `Are you sure you want to reset ALL progress for "${name}"?\n\nThis will permanently delete:\n• All messages from all scenarios\n• All feedback from all scenarios\n• All visit history\n\nThis action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch("/api/get-admin-scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: educatorId }),
      });
      if (!response.ok) throw new Error("Failed to get scenarios");

      const { scenarios: scenarioData } = await response.json();
      if (scenarioData && scenarioData.length > 0) {
        for (const scenario of scenarioData) {
          await resetScenarioProgress(scenario.id);
        }
      }

      await loadEducators();
    } catch (err) {
      console.error("Failed to reset progress:", err);
      alert("Failed to reset progress. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-purple-50 to-white">
        <div className="text-gray-600">Loading educators...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-purple-50 to-white">
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load educators</p>
          <Link href="/" className="text-purple-600 hover:underline">
            Go back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-end items-center mb-4">
            <button
              onClick={async () => {
                await logout();
                router.push("/");
              }}
              className="inline-flex items-center text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-5 h-5 mr-2" />
              Logout
            </button>
          </div>
          <h1 className="text-4xl font-bold text-gray-900">Select a Teacher</h1>
          <p className="text-xl text-gray-600 mt-2">
            Choose which teacher&apos;s scenarios you want to practice
          </p>
        </div>

        {/* Educator Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {educators.map((educator) => {
            const progressPercentage =
              educator.scenarioCount > 0
                ? (educator.visitedCount / educator.scenarioCount) * 100
                : 0;

            return (
              <div
                key={educator.id}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border-2 border-transparent hover:border-purple-500 relative group"
              >
                <button onClick={() => handleSelect(educator.id)} className="w-full p-6 text-left">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{educator.username}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Created: {new Date(educator.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-purple-600 font-semibold">→</div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex justify-between text-xs text-gray-600 mb-2">
                      <span>Progress</span>
                      <span className="font-semibold">
                        {educator.visitedCount} / {educator.scenarioCount} scenarios
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          progressPercentage === 0
                            ? "bg-gray-300"
                            : progressPercentage === 100
                            ? "bg-green-500"
                            : "bg-purple-600"
                        }`}
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                    {progressPercentage === 100 && (
                      <p className="text-xs text-green-600 mt-2 font-semibold">✓ Completed!</p>
                    )}
                  </div>
                </button>

                {educator.visitedCount > 0 && (
                  <button
                    onClick={(e) => handleResetProgress(e, educator.id, educator.username)}
                    className="absolute top-2 right-2 p-2 text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Reset all progress for this teacher"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {educators.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-600 mb-4">No educators have signed up yet.</p>
            <Link href="/" className="text-purple-600 hover:underline">
              Go back to home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
