import { withAuth } from "@workos-inc/authkit-nextjs";

/**
 * Returns the current WorkOS user id, redirecting to sign-in if there is no
 * active session. Every server action, page, and API route that touches
 * tenant-scoped data MUST call this and pass the id into queries.
 */
export async function requireUserId(): Promise<string> {
  const { user } = await withAuth({ ensureSignedIn: true });
  return user.id;
}

/**
 * Returns the full WorkOS user (id + email + name fields). Same redirect
 * behaviour as requireUserId. Use only when you need fields beyond the id.
 */
export async function requireUser() {
  const { user } = await withAuth({ ensureSignedIn: true });
  return user;
}
