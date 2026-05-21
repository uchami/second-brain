import { NextResponse } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
} from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { pin?: string } | null;
  const pin = body?.pin?.trim();
  const expected = process.env.APP_PIN;
  if (!expected) {
    return NextResponse.json(
      { error: "Servidor mal configurado" },
      { status: 500 },
    );
  }
  if (!pin || pin !== expected) {
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }
  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return res;
}
