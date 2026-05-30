import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.ts";
import { createClient } from "npm:@supabase/supabase-js";

const app = new Hono();

const getServiceClient = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

app.use('*', logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

// Helper: get authenticated user
async function getUser(c: any) {
  const accessToken = c.req.header('Authorization')?.split(' ')[1];
  if (!accessToken) return null;
  const supabase = getServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) return null;
  return user;
}

app.get("/make-server-975f4bc8/health", (c) => c.json({ status: "ok" }));

// Auth: Signup
app.post("/make-server-975f4bc8/auth/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    const supabase = getServiceClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email, password,
      user_metadata: { name },
      email_confirm: true,
    });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ user: data.user });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Auth: Session
app.get("/make-server-975f4bc8/auth/session", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ session: null });
    return c.json({ session: { user } });
  } catch {
    return c.json({ session: null });
  }
});

// Profile: Save onboarding
app.post("/make-server-975f4bc8/profile/onboarding", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const profileData = await c.req.json();
    await kv.set(`profile:${user.id}`, profileData);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Profile: Get
app.get("/make-server-975f4bc8/profile", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const profile = await kv.get(`profile:${user.id}`);
    return c.json({ profile });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Workouts: Save plan
app.post("/make-server-975f4bc8/workouts/plan", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const workoutPlan = await c.req.json();
    await kv.set(`workout_plan:${user.id}`, workoutPlan);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Workouts: Get plan
app.get("/make-server-975f4bc8/workouts/plan", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const plan = await kv.get(`workout_plan:${user.id}`);
    return c.json({ plan });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Workouts: Log completed workout
app.post("/make-server-975f4bc8/workouts/log", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const workoutLog = await c.req.json();
    const timestamp = new Date().toISOString();
    await kv.set(`workout_log:${user.id}:${timestamp}`, workoutLog);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Workouts: History (returns array sorted newest first)
app.get("/make-server-975f4bc8/workouts/history", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const logs = await kv.getByPrefix(`workout_log:${user.id}:`);
    // Sort newest first
    const sorted = (logs || []).sort((a: any, b: any) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    return c.json({ history: sorted });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Progress: Save bodyweight entry — stores as { date, weight } object
app.post("/make-server-975f4bc8/progress/bodyweight", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const { weight, date } = await c.req.json();
    if (!weight || !date) return c.json({ error: 'Missing weight or date' }, 400);
    const entry = { date, weight: parseFloat(weight) };
    await kv.set(`bodyweight:${user.id}:${date}`, entry);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Progress: Get bodyweight history — returns array of { date, weight }
app.get("/make-server-975f4bc8/progress/bodyweight", async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const entries = await kv.getByPrefix(`bodyweight:${user.id}:`);
    // Ensure entries are objects with { date, weight }
    const normalized = (entries || []).map((e: any) => {
      if (typeof e === 'number') return null; // skip old format
      if (e && typeof e === 'object' && e.date && e.weight) return e;
      return null;
    }).filter(Boolean);
    return c.json({ entries: normalized });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

Deno.serve(app.fetch);
