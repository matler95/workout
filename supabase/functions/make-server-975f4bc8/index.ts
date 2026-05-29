import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.ts";
import { createClient } from "npm:@supabase/supabase-js";

const app = new Hono();

// Create Supabase clients
const getServiceClient = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const getAnonClient = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!
);

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-975f4bc8/health", (c) => {
  return c.json({ status: "ok" });
});

// Auth: Signup
app.post("/make-server-975f4bc8/auth/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    const supabase = getServiceClient();

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });

    if (error) {
      console.log(`Signup error: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    return c.json({ user: data.user });
  } catch (error) {
    console.log(`Signup exception: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Auth: Get current session
app.get("/make-server-975f4bc8/auth/session", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ session: null });
    }

    const supabase = getServiceClient();
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return c.json({ session: null });
    }

    return c.json({ session: { user, access_token: accessToken } });
  } catch (error) {
    console.log(`Session check error: ${error.message}`);
    return c.json({ session: null });
  }
});

// User profile: Save onboarding data
app.post("/make-server-975f4bc8/profile/onboarding", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const profileData = await c.req.json();
    await kv.set(`profile:${user.id}`, profileData);

    return c.json({ success: true });
  } catch (error) {
    console.log(`Onboarding save error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// User profile: Get profile
app.get("/make-server-975f4bc8/profile", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const profile = await kv.get(`profile:${user.id}`);
    return c.json({ profile });
  } catch (error) {
    console.log(`Profile fetch error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Workouts: Save workout plan
app.post("/make-server-975f4bc8/workouts/plan", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const workoutPlan = await c.req.json();
    await kv.set(`workout_plan:${user.id}`, workoutPlan);

    return c.json({ success: true });
  } catch (error) {
    console.log(`Workout plan save error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Workouts: Get workout plan
app.get("/make-server-975f4bc8/workouts/plan", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const plan = await kv.get(`workout_plan:${user.id}`);
    return c.json({ plan });
  } catch (error) {
    console.log(`Workout plan fetch error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Workouts: Log completed workout
app.post("/make-server-975f4bc8/workouts/log", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const workoutLog = await c.req.json();
    const timestamp = new Date().toISOString();
    await kv.set(`workout_log:${user.id}:${timestamp}`, workoutLog);

    return c.json({ success: true });
  } catch (error) {
    console.log(`Workout log error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Workouts: Get workout history
app.get("/make-server-975f4bc8/workouts/history", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const logs = await kv.getByPrefix(`workout_log:${user.id}:`);
    return c.json({ history: logs || [] });
  } catch (error) {
    console.log(`Workout history fetch error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Progress: Save bodyweight entry
app.post("/make-server-975f4bc8/progress/bodyweight", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { weight, date } = await c.req.json();
    await kv.set(`bodyweight:${user.id}:${date}`, weight);

    return c.json({ success: true });
  } catch (error) {
    console.log(`Bodyweight save error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// Progress: Get bodyweight history
app.get("/make-server-975f4bc8/progress/bodyweight", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const entries = await kv.getByPrefix(`bodyweight:${user.id}:`);
    return c.json({ entries: entries || [] });
  } catch (error) {
    console.log(`Bodyweight history fetch error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

Deno.serve(app.fetch);