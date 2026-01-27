"use client";

import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function ConvexTestPage() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const ping = useQuery(api.test.ping);
  const authTest = useQuery(api.test.testAuth);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">Convex Integration Test</h1>

      {/* Test 1: Basic Connectivity */}
      <div className="mb-8 p-6 bg-gray-800 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">
          Test 1: Basic Convex Connectivity
        </h2>
        {ping === undefined ? (
          <p className="text-yellow-400">⏳ Loading...</p>
        ) : ping.success ? (
          <div className="text-green-400">
            <p>✅ {ping.message}</p>
            <p className="text-sm text-gray-400">
              Timestamp: {new Date(ping.timestamp).toISOString()}
            </p>
          </div>
        ) : (
          <p className="text-red-400">❌ Connection failed</p>
        )}
      </div>

      {/* Test 2: Clerk Auth State */}
      <div className="mb-8 p-6 bg-gray-800 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">
          Test 2: Convex Auth State (via useConvexAuth)
        </h2>
        {authLoading ? (
          <p className="text-yellow-400">⏳ Loading auth state...</p>
        ) : isAuthenticated ? (
          <p className="text-green-400">✅ Authenticated with Convex</p>
        ) : (
          <p className="text-orange-400">
            ⚠️ Not authenticated - Please sign in to test full auth flow
          </p>
        )}
      </div>

      {/* Test 3: Auth Query */}
      <div className="mb-8 p-6 bg-gray-800 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">
          Test 3: Clerk → Convex Auth Token
        </h2>
        {authTest === undefined ? (
          <p className="text-yellow-400">⏳ Loading...</p>
        ) : authTest.authenticated ? (
          <div className="text-green-400">
            <p>✅ {authTest.message}</p>
            <div className="mt-4 p-4 bg-gray-700 rounded text-sm">
              <p>
                <strong>User ID:</strong> {authTest.user?.subject}
              </p>
              <p>
                <strong>Email:</strong> {authTest.user?.email || "N/A"}
              </p>
              <p>
                <strong>Name:</strong> {authTest.user?.name || "N/A"}
              </p>
              <p>
                <strong>Issuer:</strong> {authTest.user?.issuer}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-orange-400">
            <p>⚠️ {authTest.message}</p>
            <p className="text-sm text-gray-400 mt-2">
              Sign in to verify the full auth flow works correctly.
            </p>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="p-6 bg-gray-800 rounded-lg border-2 border-gray-700">
        <h2 className="text-xl font-semibold mb-4">Summary</h2>
        <ul className="space-y-2">
          <li>{ping?.success ? "✅" : "❌"} Convex Backend Connected</li>
          <li>{!authLoading ? "✅" : "⏳"} Auth State Resolved</li>
          <li>{isAuthenticated ? "✅" : "⚠️"} User Authenticated</li>
          <li>
            {authTest?.authenticated ? "✅" : "⚠️"} Clerk → Convex Token Valid
          </li>
        </ul>
        {ping?.success && authTest?.authenticated && (
          <p className="mt-4 text-green-400 font-semibold">
            🎉 All tests passed! Phase 1 is complete.
          </p>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-8 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
        <h3 className="font-semibold text-blue-300">Test Instructions:</h3>
        <ol className="list-decimal list-inside mt-2 text-blue-200 space-y-1">
          <li>Test 1 should pass immediately (basic connectivity)</li>
          <li>If not signed in, sign in to your app first</li>
          <li>Tests 2 & 3 verify Clerk auth tokens work with Convex</li>
          <li>All green = Phase 1 complete!</li>
        </ol>
      </div>
    </div>
  );
}
