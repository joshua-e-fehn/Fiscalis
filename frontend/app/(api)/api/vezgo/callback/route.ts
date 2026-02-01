import { NextRequest, NextResponse } from "next/server";

/**
 * Vezgo OAuth Callback Handler
 *
 * This route handles the OAuth callback from Vezgo after a user connects their account.
 * It extracts the result from query parameters and sends it back to the parent window
 * via postMessage (for iframe/popup mode).
 */

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Vezgo sends various query parameters:
  // - account: the connected account ID (on success)
  // - error: error message (on failure)
  // - state: the state we passed (userId)
  const accountId = searchParams.get("account");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  // Create an HTML page that posts message to parent and closes
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Connecting...</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .message {
      text-align: center;
      padding: 2rem;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e5e5e5;
      border-top-color: #333;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="message">
    <div class="spinner"></div>
    <p>Completing connection...</p>
  </div>
  <script>
    (function() {
      const accountId = ${accountId ? `"${accountId}"` : "null"};
      const error = ${error ? `"${error}"` : "null"};
      const state = ${state ? `"${state}"` : "null"};

      // Prepare the message to send to parent
      let message;
      if (error) {
        message = {
          type: "error",
          error: error,
          state: state
        };
      } else if (accountId) {
        message = {
          type: "success",
          accountId: accountId,
          account: accountId,
          state: state
        };
      } else {
        message = {
          type: "close",
          state: state
        };
      }

      // Send message to parent window (works for both iframe and popup)
      if (window.opener) {
        // Popup mode
        window.opener.postMessage(message, "*");
        window.close();
      } else if (window.parent && window.parent !== window) {
        // Iframe mode
        window.parent.postMessage(message, "*");
      } else {
        // Direct navigation (shouldn't happen, but redirect to dashboard)
        window.location.href = "/dashboard";
      }
    })();
  </script>
</body>
</html>
  `;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html",
    },
  });
}
