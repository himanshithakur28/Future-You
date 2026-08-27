import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPrivateKey = Deno.env.get("vapid_private_key")!;
const vapidPublicKey = "BA_oTrvbbhNMHSz0uHlbb3JHAmpwc2ogvKQpmSsIxMesZik9bbniuzJtGzwxsUBaF1O87MhfmClYYfgTolALl7k";

webpush.setVapidDetails("mailto:you@example.com", vapidPublicKey, vapidPrivateKey);

const supabase = createClient(supabaseUrl, serviceRoleKey);

function nowMinutes() {
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istOffset = 330; // IST is UTC+5:30 = 330 minutes ahead
  return (utcMinutes + istOffset) % 1440;
}
function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function todayString() {
  return new Date().toISOString().split("T")[0];
}

Deno.serve(async () => {
  const today = todayString();
  const currentMinutes = nowMinutes();
  const debugUTC = new Date().toISOString();
  console.log("Calculated IST minutes:", currentMinutes, "| Raw UTC time:", debugUTC);

  const { data: goals, error: goalsError } = await supabase.from("goals").select("*");
const { data: subs, error: subsError } = await supabase.from("push_subscriptions").select("*");
const { data: entries, error: entriesError } = await supabase.from("daily_entries").select("*, goal_completions(*)").eq("date", today);

console.log("Goals error:", goalsError, "Subs error:", subsError, "Entries error:", entriesError);
console.log("Goals found:", goals?.length, "Subs found:", subs?.length, "Entries found:", entries?.length);
 let sent = 0;

  for (const goal of goals || []) {
    const sub = subs?.find((s) => s.user_id === goal.user_id);
    if (!sub) continue;

    const entry = entries?.find((e) => e.goal_id === goal.id && e.user_id === goal.user_id);
    const hasRecording = !!entry?.audio_url;
    const completion = Array.isArray(entry?.goal_completions) ? entry?.goal_completions[0] : entry?.goal_completions;
    const isCompleted = completion?.completed !== undefined && completion?.completed !== null;

    const recordDue = currentMinutes >= timeToMinutes(goal.record_time) && !hasRecording;
    const checkinDue = currentMinutes >= timeToMinutes(goal.checkin_time) && hasRecording && !isCompleted;
    
    let payload = null;
    if (recordDue) {
      if (recordDue) {
  payload = { title: "Future You", body: `Time to record — what's your plan for "${goal.label}"?`, taskId: goal.id, action: "record" };
}
  } else if (checkinDue) {
  payload = { title: "Future You", body: `Morning-you left a message about "${goal.label}" 🎧`, taskId: goal.id, action: "checkin" };
}

    if (payload) {
      const type = recordDue ? "record" : "checkin";
      const { data: log } = await supabase
        .from("reminder_log")
        .select("*")
        .eq("goal_id", goal.id)
        .eq("date", today)
        .eq("type", type)
        .maybeSingle();

      const hoursSinceLastSend = log?.last_sent_at
        ? (Date.now() - new Date(log.last_sent_at).getTime()) / (1000 * 60 * 60)
        : 999;

      const canSend = !log || (log.sent_count < 2 && hoursSinceLastSend >= 4);

      if (canSend) {
        try {
          await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
          sent++;
          await supabase.from("reminder_log").upsert(
            {
              goal_id: goal.id,
              date: today,
              type,
              sent_count: (log?.sent_count || 0) + 1,
              last_sent_at: new Date().toISOString(),
            },
            { onConflict: "goal_id,date,type" }
          );
        } catch (err) {
          console.error("Push failed for user:", goal.user_id, err);
        }
      }
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});

