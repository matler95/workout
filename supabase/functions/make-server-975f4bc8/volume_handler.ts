// ── Weekly volume summary ─────────────────────────────────────────────────────
//
// FIX #5: Use the start of the current ISO calendar week (Monday) instead of
// "today - 7 days". The DB view groups sets by DATE_TRUNC('week'), so mixing a
// rolling 7-day cutoff with a Monday-anchored grouping would return partial data
// from two different weeks. Aligning both to the same week boundary gives
// accurate "this week" numbers.
//
// Replace the existing /progress/volume handler in
// supabase/functions/make-server-975f4bc8/index.ts with this block.

app.get("/make-server-975f4bc8/progress/volume", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);

  try {
    // Compute the Monday of the current ISO week in UTC.
    // new Date() gives today; getUTCDay() returns 0=Sun…6=Sat.
    // Subtracting (day + 6) % 7 days always lands on Monday.
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sun
    const daysToMonday = (dayOfWeek + 6) % 7;
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - daysToMonday);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekStartDate = weekStart.toISOString().split('T')[0]; // YYYY-MM-DD

    const { data, error } = await auth.db
      .from('weekly_volume')
      .select('*')
      .eq('user_id', auth.user.id)
      .gte('week_start', weekStartDate)
      .order('total_sets', { ascending: false });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ volume: data || [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
