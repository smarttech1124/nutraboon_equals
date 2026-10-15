import { currentUser } from "@/lib/auth/next";

/**
 * Whether this browser has a valid session, for the header on static pages
 * (home, about, 404), which are not rendered per visitor. Only a yes/no and
 * a first name: nothing an attacker could use. Never cached. It is a UI
 * hint, not authorization: every protected page and action checks the
 * session on the server itself.
 */
export async function GET() {
  const user = await currentUser("web");
  return Response.json(
    { signedIn: user !== null, ...(user ? { firstName: user.name.split(/\s+/)[0] } : {}) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
