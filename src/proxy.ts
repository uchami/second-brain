import { authkitProxy } from "@workos-inc/authkit-nextjs";

// AuthKit handles auth at the proxy layer: any path not listed in
// unauthenticatedPaths redirects to the WorkOS hosted sign-in page.
// /callback is the OAuth return URL and must stay public.
export default authkitProxy({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/callback"],
  },
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest|icons|sw\\.js).*)",
  ],
};
