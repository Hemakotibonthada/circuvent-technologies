import { redirect } from "next/navigation";

/** Retired route — folded into the Insights section of the console. */
export default function Page() {
  redirect("/smarthome/insights?tab=reports");
}