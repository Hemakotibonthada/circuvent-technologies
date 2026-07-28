"use client";

import WeatherCard from "@/components/weather/WeatherCard";

export default function ConsoleWeatherPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">Weather</h1>
        <p className="mt-1 text-sm text-slate-400">Local conditions & forecast to plan and trigger your home automations.</p>
      </div>
      <div className="max-w-2xl">
        <WeatherCard />
      </div>
    </div>
  );
}
