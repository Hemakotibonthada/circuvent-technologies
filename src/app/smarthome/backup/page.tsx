import { redirect } from "next/navigation";

/** Retired route — folded into the Settings section of the console. */
export default function Page() {
  redirect("/smarthome/settings?tab=data");
}