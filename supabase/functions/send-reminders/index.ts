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
  return now.getHours() * 60 + now.getMinutes();
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

  const { data: goals } = await supabase.from("goals").select("*");
  const { data: subs } = await supabase.from("push_subscriptions").select("*");
  const { data: entries } = await supabase.from("daily_entries").select("*, goal_completions(*)").eq("date", today);

  let sent = 0;

  for (const goal of goals || []) {
    const sub = subs?.find((s) => s.user_id === goal.user_id);
    if (!sub) continue;

    const entry = entries?.find((e) => e.goal_id === goal.id && e.user_id === goal.user_id);
    const hasRecording = !!entry?.audio_url;
    const completion = Array.isArray(entry?.goal_completions) ? entry?.goal_completions[0] : entry?.goal_completions;
    const isCompleted = completion?.completed !== undefined && completion?.completed !== null;

    const recordDue = currentMinutes === timeToMinutes(goal.record_time) && !hasRecording;
    const checkinDue = currentMinutes === timeToMinutes(goal.checkin_time) && hasRecording && !isCompleted;

    let payload = null;
    if (recordDue) {
      payload = { title: "Future You", body: `Time to record "${goal.label}" 🎙️`, taskId: goal.id, action: "record" };
    } else if (checkinDue) {
      payload = { title: "Future You", body: `Check in on "${goal.label}" — did you do it?`, taskId: goal.id, action: "checkin" };
    }

    if (payload) {
      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
        sent++;
      } catch (err) {
        console.error("Push failed for user:", goal.user_id, err);
      }
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});

