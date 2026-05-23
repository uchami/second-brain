import { handleAuth } from "@workos-inc/authkit-nextjs";

// WorkOS redirects the browser here after a successful AuthKit sign-in.
// handleAuth() exchanges the OAuth code, sets the session cookie, and
// redirects the user back to `returnPathname` (defaults to `/`).
export const GET = handleAuth();
