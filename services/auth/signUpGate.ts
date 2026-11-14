/**
 * Sign-up policy while sign-up is waitlist-only (ENG-226, until GDPR
 * export/delete ships): new visitors are sent to /waitlist; only someone
 * holding a Clerk invitation (a waitlist approval or a manual invite, whose
 * link carries `__clerk_ticket`) reaches the <SignUp /> form. Later steps of
 * an already started sign-up (/sign-up/verify-email-address, …) stay
 * reachable, since Clerk keeps the ticket in its own state, not the URL.
 *
 * Framework-free: used by app/(auth)/sign-up and vitest.
 */

/** Query parameter Clerk puts on invitation links. */
export const CLERK_TICKET_PARAM = "__clerk_ticket";

export const WAITLIST_PATH = "/waitlist";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Whether the sign-up route should render the Clerk form (true) or send the
 * visitor to the waitlist (false). `segments` are the catch-all route
 * segments after /sign-up.
 */
export function allowSignUpForm(
  segments: string[] | undefined,
  searchParams: SearchParams,
): boolean {
  if (segments && segments.length > 0) return true;
  const ticket = searchParams[CLERK_TICKET_PARAM];
  const value = Array.isArray(ticket) ? ticket[0] : ticket;
  return typeof value === "string" && value.length > 0;
}
