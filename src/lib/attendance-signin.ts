import type { ControlUser } from "./control-plane";

const messages: Record<string, string> = {
  expired: "Your sign-in expired. Please try again.",
  denied: "Attendance access was not granted. Ask your administrator to enable Attendance in My Account.",
  environment: "This environment is not connected to the attendance identity service.",
  session: "The attendance service could not create your session. Please try again or contact support.",
};
type Result = { handled: false } | { handled: true; session?: { token: string; refreshToken?: string; user: ControlUser }; error?: string };

export async function completeAttendanceSignIn(): Promise<Result> {
  const url = new URL(window.location.href);
  const outcome = url.searchParams.get("attendance_sso");
  if (!outcome) return { handled: false };
  url.searchParams.delete("attendance_sso");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  if (outcome !== "complete") return { handled: true, error: messages[outcome] || "Single sign-on did not complete. Please try again." };
  try {
    const response = await fetch("/api/attendance/auth/sso/session", { method: "POST", credentials: "same-origin", cache: "no-store" });
    const session = await response.json();
    if (!response.ok || !session.token || !session.user?.email) return { handled: true, error: messages.expired };
    return { handled: true, session };
  } catch { return { handled: true, error: "Could not finish sign-in. Please try again." }; }
}
