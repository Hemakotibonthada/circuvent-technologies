import { redirect } from "next/navigation";

/** Retired route — folded into the Security section of the console. */
export default function Page() {
  redirect("/smarthome/security?tab=cameras");
}