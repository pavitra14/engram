// Deletes the signed-in person's Engram Cloud account and, through the tables'
// "on delete cascade", every row they own. Their phone keeps its own copy.
//
// The request must carry the person's own session token. The function works out
// who they are from that token alone; it takes no user id from the request body.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// The project's secret key, which only exists inside functions. Newer projects
// provide it as a named set; older ones as a single service role key.
function secretKey(): string {
  try {
    const named = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    if (named.default) return named.default;
  } catch {
    // Fall through to the older variable.
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Not signed in." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json(401, { error: "Not signed in." });

  const { error: failed } = await admin.auth.admin.deleteUser(data.user.id);
  if (failed) return json(500, { error: "The account could not be deleted. Try again." });
  return json(200, { deleted: true });
});
