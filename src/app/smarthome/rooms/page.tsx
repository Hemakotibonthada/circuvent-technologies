import { redirect } from "next/navigation";

/** Retired route — folded into the Spaces section of the console. */
export default function Page() {
  redirect("/smarthome/spaces?tab=rooms");
}