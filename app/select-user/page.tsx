"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useScenarioStore } from "../store/useScenarioStore";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";

interface User {
  id: string;
  username: string;
  created_at: string;
}

export default function SelectUserPage() {
  const router = useRouter();
  const { setCurrentUser, loadUserScenarios, scenarios } = useScenarioStore();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, created_at')
        .order('username', { ascending: true });

      if (error) throw error;

      setUsers(data || []);
    } catch (err) {
      console.error("Error loading users:", err);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserSelect = async (username: string) => {
    try {
      setIsLoading(true);
      // Set as viewer (not admin)
      await setCurrentUser(username, false);
      await loadUserScenarios();

      // Go to first scenario's chat page
      const firstSlug = scenarios[0]?.slug || "asking-profile";
      router.push(`/chat/${firstSlug}`);
    } catch (err) {
      console.error("Error loading user:", err);
      setError(true);
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
      await loadUsers();
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
          <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900">
            Select a User Account
          </h1>
          <p className="text-xl text-gray-600 mt-2">
            Choose from existing user accounts to view their scenarios
          </p>
        </div>

        {/* User Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border-2 border-transparent hover:border-purple-500 relative group"
            >
              <button
                onClick={() => handleUserSelect(user.username)}
                className="w-full p-6 text-left"
              >
                <div className="flex items-center justify-between">
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
              </button>
              <button
                onClick={(e) => handleDeleteUser(e, user.id, user.username)}
                className="absolute top-2 right-2 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete user"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
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
