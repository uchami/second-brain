import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

// TEMPORARY: returns the current WorkOS user so we can grab the id once after
// the multi-tenant cutover and run the legacy → real-user UPDATE in the DB.
// Delete this route after that one-shot migration is done.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  });
}
