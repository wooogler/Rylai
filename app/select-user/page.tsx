"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useScenarioStore } from "../store/useScenarioStore";
import { ArrowLeft, Trash2, RotateCcw, LogOut } from "lucide-react";
import Link from "next/link";

interface User {
  id: string;
  username: string;
  created_at: string;
}

interface AdminWithProgress extends User {
  scenarioCount: number;
  visitedCount: number;
}

export default function SelectUserPage() {
  const router = useRouter();
  const { setCurrentUser, loadUserScenarios, loadScenarioProgress, resetScenarioProgress, logout, userType, userId } = useScenarioStore();
  const [users, setUsers] = useState<User[]>([]);
  const [adminsWithProgress, setAdminsWithProgress] = useState<AdminWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadUsersWithProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUsersWithProgress = async () => {
    try {
      // Load users (admins if learner/parent type)
      const query = supabase
        .from('users')
        .select('id, username, created_at, user_type')
        .order('username', { ascending: true });

      if (userType === 'user' || userType === 'parent') {
        query.eq('user_type', 'admin');
      }

      const { data: userData, error: userError } = await query;
      if (userError) throw userError;

      setUsers(userData || []);

      // For learner/parent type, load progress for each admin
      if ((userType === 'user' || userType === 'parent') && userId) {
        const progressMap = await loadScenarioProgress();
        console.log('[SelectUser] Progress map loaded:', { userId, userType, progressMapSize: progressMap.size, progressMap });

        const adminsWithProgressData: AdminWithProgress[] = await Promise.all(
          (userData || []).map(async (user) => {
            // Get scenario count for this admin
            const { data: scenarioData } = await supabase
              .from('scenarios')
              .select('id')
              .eq('user_id', user.id);

            const scenarioCount = scenarioData?.length || 0;

            // Count how many of this admin's scenarios the learner has visited
            const visitedCount = scenarioData?.filter(s => progressMap.has(s.id)).length || 0;

            console.log('[SelectUser] Admin progress:', { admin: user.username, scenarioCount, visitedCount, scenarioIds: scenarioData?.map(s => s.id) });

            return {
              ...user,
              scenarioCount,
              visitedCount
            };
          })
        );

        setAdminsWithProgress(adminsWithProgressData);
      }
    } catch (err) {
      console.error("Error loading users:", err);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserSelect = async (selectedUsername: string) => {
    try {
      setIsLoading(true);

      if (userType === 'user' || userType === 'parent') {
        // Learner/Parent selecting an admin's scenarios
        // Keep the learner's identity but load admin's scenarios
        const { data: adminUser } = await supabase
          .from('users')
          .select('id, common_system_prompt, feedback_persona, feedback_instruction')
          .eq('username', selectedUsername)
          .eq('user_type', 'admin')
          .single();

        if (!adminUser) {
          throw new Error('Admin user not found');
        }

        // Update store with selected admin's info
        const store = useScenarioStore.getState();
        store.adminUserId = adminUser.id;
        store.commonSystemPrompt = adminUser.common_system_prompt;
        store.feedbackPersona = adminUser.feedback_persona;
        store.feedbackInstruction = adminUser.feedback_instruction;

        await loadUserScenarios();

        // Go to first scenario's chat page - get scenarios from store after loading
        const updatedScenarios = useScenarioStore.getState().scenarios;
        const firstSlug = updatedScenarios[0]?.slug || "stage-1-friendship";
        console.log('[handleUserSelect] Navigating to scenario:', { firstSlug, scenarioId: updatedScenarios[0]?.id, totalScenarios: updatedScenarios.length });
        router.push(`/chat/${firstSlug}`);
      } else {
        // Admin viewing another user's scenarios
        await setCurrentUser(selectedUsername, "admin");
        await loadUserScenarios();

        // Go to first scenario's chat page - get scenarios from store after loading
        const updatedScenarios = useScenarioStore.getState().scenarios;
        const firstSlug = updatedScenarios[0]?.slug || "stage-1-friendship";
        router.push(`/chat/${firstSlug}`);
      }
    } catch (err) {
      console.error("Error loading user:", err);
      setError(true);
      setIsLoading(false);
    }
  };

  const handleResetProgress = async (e: React.MouseEvent, adminId: string, adminUsername: string) => {
    e.stopPropagation();

    if (!confirm(`Are you sure you want to reset ALL progress for "${adminUsername}"?\n\nThis will permanently delete:\n• All messages from all scenarios\n• All feedback from all scenarios\n• All visit history\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      setIsLoading(true);

      // Get all scenarios for this admin
      const { data: scenarioData } = await supabase
        .from('scenarios')
        .select('id')
        .eq('user_id', adminId);

      if (scenarioData && scenarioData.length > 0) {
        // Reset each scenario
        for (const scenario of scenarioData) {
          await resetScenarioProgress(scenario.id);
        }
      }

      // Reload the page data
      await loadUsersWithProgress();
    } catch (error) {
      console.error('Failed to reset progress:', error);
      alert('Failed to reset progress. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (e: React.MouseEvent, userId: string, username: string) => {
    e.stopPropagation();

    if (!confirm(`Are you sure you want to delete user "${username}" and all their scenarios? This action cannot be undone.`)) {
      return;
    }

    try {
      setIsLoading(true);

      // Delete all scenarios for this user first (due to foreign key constraint)
      const { error: scenariosError } = await supabase
        .from('scenarios')
        .delete()
        .eq('user_id', userId);

      if (scenariosError) throw scenariosError;

      // Delete the user
      const { error: userError } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (userError) throw userError;

      // Reload users list
      await loadUsersWithProgress();
    } catch (err) {
      console.error("Error deleting user:", err);
      alert("Failed to delete user. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-purple-50 to-white">
        <div className="text-gray-600">Loading users...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-purple-50 to-white">
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load users</p>
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
          <div className="flex justify-between items-center mb-4">
            {userType !== 'user' && userType !== 'parent' && (
              <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Home
              </Link>
            )}
            {(userType === 'user' || userType === 'parent') && <div></div>}
            <button
              onClick={() => {
                logout();
                router.push('/');
              }}
              className="inline-flex items-center text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-5 h-5 mr-2" />
              Logout
            </button>
          </div>
          <h1 className="text-4xl font-bold text-gray-900">
            {userType === 'user' ? 'Select a Teacher' : userType === 'parent' ? 'Select an Educator' : 'Select a User Account'}
          </h1>
          <p className="text-xl text-gray-600 mt-2">
            {userType === 'user'
              ? 'Choose which teacher\'s scenarios you want to practice'
              : userType === 'parent'
              ? 'Choose which educator\'s scenarios to view your child\'s progress'
              : 'Choose from existing user accounts to view their scenarios'}
          </p>
        </div>

        {/* User Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {((userType === 'user' || userType === 'parent') ? adminsWithProgress : users).map((user) => {
            const adminData = (userType === 'user' || userType === 'parent') ? user as AdminWithProgress : null;
            const progressPercentage = adminData && adminData.scenarioCount > 0
              ? (adminData.visitedCount / adminData.scenarioCount) * 100
              : 0;

            return (
              <div
                key={user.id}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border-2 border-transparent hover:border-purple-500 relative group"
              >
                <button
                  onClick={() => handleUserSelect(user.username)}
                  className="w-full p-6 text-left"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {user.username}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Created: {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-purple-600 font-semibold">
                      →
                    </div>
                  </div>

                  {/* Progress Bar - Only for learner/parent viewing admins */}
                  {(userType === 'user' || userType === 'parent') && adminData && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="flex justify-between text-xs text-gray-600 mb-2">
                        <span>Progress</span>
                        <span className="font-semibold">
                          {adminData.visitedCount} / {adminData.scenarioCount} scenarios
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            progressPercentage === 0
                              ? 'bg-gray-300'
                              : progressPercentage === 100
                              ? 'bg-green-500'
                              : 'bg-purple-600'
                          }`}
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                      {progressPercentage === 100 && (
                        <p className="text-xs text-green-600 mt-2 font-semibold">
                          ✓ Completed!
                        </p>
                      )}
                    </div>
                  )}
                </button>

                {/* Reset button - Only for learner with progress (not for parents) */}
                {userType === 'user' && adminData && adminData.visitedCount > 0 && (
                  <button
                    onClick={(e) => handleResetProgress(e, user.id, user.username)}
                    className="absolute top-2 right-2 p-2 text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Reset all progress for this teacher"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}

                {/* Delete button - Only for admin (not for learner or parent) */}
                {userType !== 'user' && userType !== 'parent' && (
                  <button
                    onClick={(e) => handleDeleteUser(e, user.id, user.username)}
                    className="absolute top-2 right-2 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete user"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {users.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-600 mb-4">No users found.</p>
            <Link href="/" className="text-purple-600 hover:underline">
              Create a new account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
