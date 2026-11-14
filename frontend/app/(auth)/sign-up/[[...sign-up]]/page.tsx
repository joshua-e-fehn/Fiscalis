import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import {
  WAITLIST_PATH,
  allowSignUpForm,
} from "@/../services/auth/signUpGate";

/**
 * Sign-up is waitlist-only (ENG-226): without a Clerk invitation the visitor
 * is sent to /waitlist. The Clerk instance's sign-up mode is "Waitlist" too,
 * so this is the in-app half of that policy.
 */
export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ "sign-up"?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ "sign-up": segments }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!allowSignUpForm(segments, query)) redirect(WAITLIST_PATH);

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <SignUp forceRedirectUrl="/onboarding" />
    </div>
  );
}
