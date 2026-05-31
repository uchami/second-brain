import { authkitProxy } from "@workos-inc/authkit-nextjs";

// AuthKit handles auth at the proxy layer: any path not listed in
// unauthenticatedPaths redirects to the WorkOS hosted sign-in page.
// /callback is the OAuth return URL and must stay public.
export default authkitProxy({
  middlewareAuth: {
    enabled: true,
    // /callback — OAuth return URL
    // /api/ical/.* — calendar feed con su propio token (autenticación por URL),
    //                tiene que ser accesible sin sesión WorkOS para que
    //                Google/Apple Calendar puedan polearlo.
    unauthenticatedPaths: ["/callback", "/api/ical/:path*"],
  },
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest|icons|sw\\.js).*)",
  ],
};
