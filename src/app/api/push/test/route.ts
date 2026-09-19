import { NextResponse } from "next/server";
import webpush from "web-push";
import { allSubscriptions } from "@/lib/push/subscriptions";

// This route sends a REAL Web Push message via the browser's push service —
// it is the "bounded attempt" at closed-app delivery described in the
// brief. It is only ever called from the scenario controls, and the
// payload is always marked synthetic:true so the notification the user sees
// visibly says [Test] — this never dresses up a fake alert as a real one.

export async function POST(req: Request) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return NextResponse.json(
      { error: "Web Push is not configured (missing VAPID keys) — see .env.example.", sent: 0 },
      { status: 503 }
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const body = await req.json().catch(() => ({}));
  const message = body.message ?? "A disruption on your saved route was just injected for testing.";

  const subs = allSubscriptions();
  if (subs.length === 0) {
    return NextResponse.json({ error: "No active push subscription — enable alerts first.", sent: 0 }, { status: 400 });
  }

  const payload = JSON.stringify({ title: "Flex — trip conditions changed", body: message, synthetic: true });

  const results = await Promise.allSettled(subs.map((s) => webpush.sendNotification(s, payload)));
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ sent, total: subs.length });
}
