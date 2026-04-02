"use client";

// ══════════════════════════════════════════════════════════════
// Launchpad — All features as beautiful interactive cards
// ══════════════════════════════════════════════════════════════

import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getNavSections, SECTION_COLORS, DEFAULT_COLOR } from "@/components/app-shell";

export default function LaunchpadPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const sections = useMemo(() => getNavSections(user?.role), [user?.role]);

  // Filter sections by search
  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase();
    return sections
      .map(s => ({
        ...s,
        items: s.items.filter(
          i => i.label.toLowerCase().includes(q) || s.label.toLowerCase().includes(q)
        ),
      }))
      .filter(s => s.items.length > 0);
  }, [sections, search]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8">
      {/* Hero header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
          {greeting()}, {user?.firstName} 🚀
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Access all your platform features from one place
        </p>

        {/* Search bar */}
        <div className="relative mt-5 max-w-md">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            placeholder="Search features..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Section cards grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredSections.map((section, idx) => {
          const colors = SECTION_COLORS[section.label] || DEFAULT_COLOR;
          const isExpanded = expandedSection === section.label;

          return (
            <div
              key={section.label}
              className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br backdrop-blur-sm transition-all duration-300 ${colors.border} ${colors.bg} hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20`}
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              {/* Card header — always visible */}
              <button
                onClick={() => setExpandedSection(isExpanded ? null : section.label)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${colors.iconBg} transition-transform duration-300 group-hover:scale-110`}>
                  <span className="text-xl">{section.railIcon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm font-semibold ${colors.text}`}>{section.label}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{section.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="rounded-full bg-white/60 dark:bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    {section.items.length}
                  </span>
                  <svg
                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Quick action: go to first item */}
              {!isExpanded && section.items.length === 1 && (
                <div className="px-4 pb-3">
                  <a
                    href={section.items[0].href}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${colors.text} bg-white/60 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 transition-colors`}
                  >
                    Open {section.items[0].label}
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </a>
                </div>
              )}

              {/* Expanded items grid */}
              {isExpanded && (
                <div className="border-t border-white/20 dark:border-white/5 px-3 pb-3 pt-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {section.items.map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-slate-600 bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all duration-150 hover:shadow-sm"
                      >
                        <span className="text-sm">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick links when not expanded and multiple items */}
              {!isExpanded && section.items.length > 1 && (
                <div className="flex flex-wrap gap-1 px-4 pb-3">
                  {section.items.slice(0, 3).map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-500 bg-white/40 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all"
                    >
                      <span className="text-xs">{item.icon}</span>
                      <span>{item.label}</span>
                    </a>
                  ))}
                  {section.items.length > 3 && (
                    <span className="flex items-center px-2 py-1 text-[11px] text-slate-400">
                      +{section.items.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredSections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-4xl">🔍</span>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No features match &ldquo;{search}&rdquo;
          </p>
          <button
            onClick={() => setSearch("")}
            className="mt-2 text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}
