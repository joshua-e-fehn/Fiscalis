import { query } from "./_generated/server";

/**
 * Test query to verify Convex + Clerk authentication is working.
 * Returns user information if authenticated, or null if not.
 */
export const testAuth = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return {
        authenticated: false,
        message: "Not authenticated - Clerk token not received by Convex",
      };
    }

    return {
      authenticated: true,
      message: "Authentication working!",
      user: {
        subject: identity.subject,
        email: identity.email,
        name: identity.name,
        issuer: identity.issuer,
      },
    };
  },
});

/**
 * Simple public query that doesn't require authentication.
 * Use this to verify basic Convex connectivity.
 */
export const ping = query({
  args: {},
  handler: async () => {
    return {
      success: true,
      timestamp: Date.now(),
      message: "Convex is connected!",
    };
  },
});
