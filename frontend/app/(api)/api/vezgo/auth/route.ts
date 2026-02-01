/**
 * Vezgo Auth Endpoint
 *
 * This endpoint provides Vezgo tokens to the client-side SDK.
 * The browser-side Vezgo SDK calls this endpoint to get authentication tokens.
 *
 * Flow:
 * 1. Client-side Vezgo SDK calls POST /api/vezgo/auth
 * 2. We verify the user is authenticated via Clerk
 * 3. We use the Vezgo server SDK to get a token for this user
 * 4. Return { token } to the client SDK
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Vezgo from "vezgo-sdk-js";

// Initialize Vezgo server-side client
function getVezgoClient() {
  const clientId = process.env.VEZGO_CLIENT_ID;
  const secret = process.env.VEZGO_SECRET;

  if (!clientId || !secret) {
    throw new Error(
      "Missing VEZGO_CLIENT_ID or VEZGO_SECRET environment variables",
    );
  }

  return Vezgo.init({
    clientId,
    secret,
  });
}

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get Vezgo client and login with the userId
    const vezgo = getVezgoClient();
    const user = vezgo.login(userId);

    // Get a token for this user
    const token = await user.getToken();

    if (!token) {
      return NextResponse.json(
        { error: "Failed to get Vezgo token" },
        { status: 500 },
      );
    }

    return NextResponse.json({ token });
  } catch (error) {
    console.error("Vezgo auth error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
