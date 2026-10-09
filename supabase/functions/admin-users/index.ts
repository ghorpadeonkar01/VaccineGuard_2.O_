import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !anonKey || !serviceKey || !token) return json({ error: "Missing server configuration or session" }, 401);

  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "Sign in again to continue" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actor, error: roleError } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (roleError || actor?.role !== "admin") return json({ error: "Administrator access required" }, 403);

  try {
    const body = await req.json();
    if (body.action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      const { data: profiles, error: profilesError } = await admin.from("profiles").select("id,role,display_name,checkpoint_id,created_at");
      if (profilesError) throw profilesError;
      const byId = new Map((profiles || []).map((p) => [p.id, p]));
      return json((data.users || []).filter((u) => byId.has(u.id)).map((u) => ({ ...byId.get(u.id), email: u.email })));
    }
    if (body.action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const display_name = String(body.display_name || "").trim();
      const role = String(body.role || "");
      if (!email || !display_name || password.length < 8) return json({ error: "Enter a name, valid email, and password of at least 8 characters" }, 400);
      if (!["sender_receiver", "transporter", "checkpoint"].includes(role)) return json({ error: "Choose one of the three operational roles" }, 400);
      const checkpoint_id = body.checkpoint_id ? Number(body.checkpoint_id) : null;
      if (role === "checkpoint" && checkpoint_id === null) return json({ error: "Assign a checkpoint to checkpoint managers" }, 400);
      if (role === "checkpoint" && checkpoint_id !== null && !Number.isInteger(checkpoint_id)) return json({ error: "Checkpoint ID must be a whole number" }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: display_name } });
      if (error || !data.user) throw error || new Error("Supabase did not create the account");
      const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, role, display_name, checkpoint_id: role === "checkpoint" ? checkpoint_id : null });
      if (profileError) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw profileError;
      }
      return json({ id: data.user.id, email, role, display_name, checkpoint_id });
    }
    if (body.action === "delete") {
      const id = String(body.id || "");
      if (!id || id === user.id) return json({ error: "Choose another user; you cannot delete your own account here" }, 400);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
      return json({ success: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "User operation failed" }, 400);
  }
});
