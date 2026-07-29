import { redirect } from "next/navigation";

/** Retired route — folded into the Energy section of the console. */
export default function Page() {
  redirect("/smarthome/energy?tab=live");
}