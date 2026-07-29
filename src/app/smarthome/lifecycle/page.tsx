import { redirect } from "next/navigation";

/** Retired route — folded into the Devices section of the console. */
export default function Page() {
  redirect("/smarthome/devices?tab=fleet");
}