import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "./lib/auth";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public assets and login route
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js";

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthed = token ? await verifySessionToken(token) : false;

  if (!isAuthed && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isAuthed && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
