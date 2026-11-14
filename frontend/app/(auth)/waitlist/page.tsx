import { Waitlist } from "@clerk/nextjs";

/**
 * Sign-up is waitlist-only until GDPR export/delete ships (ENG-226). Clerk
 * stores the entry; an approved visitor gets an invitation email whose link
 * opens /sign-up with a ticket (services/auth/signUpGate.ts). Existing users
 * sign in as before.
 */
export default function WaitlistPage() {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <Waitlist signInUrl="/sign-in" afterJoinWaitlistUrl="/" />
    </div>
  );
}
