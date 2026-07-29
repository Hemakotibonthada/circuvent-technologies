import { redirect } from "next/navigation";

/** Retired route — folded into the Automation section of the console. */
export default function Page() {
  redirect("/smarthome/automation?tab=schedules");
}