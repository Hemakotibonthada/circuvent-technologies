import { redirect } from "next/navigation";

/** Folded into the Security section, next to Access and Cameras. */
export default function Page() {
  redirect("/smarthome/security?tab=vehicles");
}
