import type { Metadata } from "next";
import WeatherCard from "@/components/weather/WeatherCard";

export const metadata: Metadata = {
  title: "Weather · Circuvent",
  description: "Live weather, hourly and 7-day forecast, air quality, and weather-aware smart-home tips.",
};

export default function WeatherPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold sm:text-4xl" style={{ color: "var(--text-primary)" }}>Weather</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm" style={{ color: "var(--text-tertiary)" }}>
          Live conditions, hourly and 7-day forecast, air quality and weather-aware tips for your Circuvent home — search any city or use your location.
        </p>
      </div>
      <WeatherCard />
      <p className="mt-6 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
        Circuvent uses the forecast to power weather-aware automations — auto-close curtains before rain, pre-cool on hot afternoons, and more.
      </p>
    </main>
  );
}
