// Buying/support questions for /smart-home. Shared by the page (rendered as a
// disclosure list) and its layout (emitted as FAQPage structured data), so the
// visible copy and the rich-result payload can never drift apart.

export interface SmartHomeFaq {
  question: string;
  answer: string;
}

export const SMART_HOME_FAQS: SmartHomeFaq[] = [
  {
    question: "Do I need a hub to use Circuvent devices?",
    answer:
      "No. Every Wi-Fi device — plugs, switches, lights, fans, locks and curtains — connects straight to your 2.4 GHz network and works on its own. The Home Hub is only needed if you want local-first automations that keep running when the internet is down, or if you want to bridge Zigbee and BLE devices.",
  },
  {
    question: "What happens to my devices if the internet goes down?",
    answer:
      "Physical buttons and switches keep working, so nothing in your home stops functioning. Devices remember their last state through a power cut. With a Home Hub, your scenes and schedules also continue to run locally; without one, app and voice control resume as soon as the connection is back.",
  },
  {
    question: "Does this work with Alexa and Google Home?",
    answer:
      "Yes. Link your Circuvent account once in the Alexa or Google Home app and every compatible device shows up for voice control, routines and grouping. You can keep using the Circuvent app at the same time — the state stays in sync both ways.",
  },
  {
    question: "Is my data sent to a third-party cloud?",
    answer:
      "No. Circuvent runs its own control plane — MQTT broker, API and web console — rather than renting someone else's IoT cloud. Onboarding is encrypted, traffic runs over TLS, and each device gets its own broker credentials.",
  },
  {
    question: "Can I control devices when I'm away from home?",
    answer:
      "Yes. Remote control works from anywhere over the app or the web console, with no port forwarding or VPN setup on your router.",
  },
  {
    question: "How long does setup actually take?",
    answer:
      "Under a minute per device. Open the app, tap Add device, scan the QR code on the box and choose your Wi-Fi network — the device provisions itself and appears ready to control. No codes to type and no separate configuration app.",
  },
];
