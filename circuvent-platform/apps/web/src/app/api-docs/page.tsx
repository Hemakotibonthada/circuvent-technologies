"use client";

import React, { useState, useMemo } from "react";
import { useApi } from "@/hooks/use-auth";
import {
  PageHeader, Card, StatCard, Badge, Button,
  Input, Tabs, EmptyState,
} from "@/components/ui";

/* ── Types ──────────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "emerald";

interface APIEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  parameters: Array<{
    name: string;
    in: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  responseExample: Record<string, any>;
  tags: string[];
  requiresAuth: boolean;
  service?: string;
}

interface ServiceDocs {
  key: string;
  name: string;
  description: string;
  baseUrl: string;
  version: string;
  endpointCount: number;
  endpoints: APIEndpoint[];
}

interface Stats {
  totalEndpoints: number;
  totalServices: number;
  byMethod: Record<string, number>;
  byService: Record<string, number>;
  byTag: Record<string, number>;
  authRequired: number;
  publicEndpoints: number;
}

/* ── Color maps ─────────────────────────────────────────── */

const methodColors: Record<string, BadgeColor> = {
  GET: "green", POST: "blue", PUT: "amber", PATCH: "purple", DELETE: "red",
};

const serviceIcons: Record<string, string> = {
  gateway: "🌐", hr: "👥", iot: "📡", finance: "💰",
};

/* ── Component ──────────────────────────────────────────── */

export default function ApiDocsPage() {
  const { data: services } = useApi<ServiceDocs[]>("/hr/api-docs");
  const { data: stats } = useApi<Stats>("/hr/api-docs/stats");

  const [activeService, setActiveService] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set());
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  /* ── Filtered endpoints ────────────────────────────────── */

  const filteredEndpoints = useMemo(() => {
    if (!services) return [];

    let endpoints: Array<APIEndpoint & { serviceName: string; serviceKey: string }> = [];

    for (const svc of services) {
      if (activeService !== "all" && svc.key !== activeService) continue;
      for (const ep of svc.endpoints) {
        endpoints.push({ ...ep, serviceName: svc.name, serviceKey: svc.key });
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      endpoints = endpoints.filter(
        (ep) =>
          ep.path.toLowerCase().includes(query) ||
          ep.description.toLowerCase().includes(query) ||
          ep.method.toLowerCase().includes(query) ||
          ep.tags.some((t) => t.includes(query)),
      );
    }

    return endpoints;
  }, [services, activeService, searchQuery]);

  /* ── Handlers ──────────────────────────────────────────── */

  const toggleEndpoint = (key: string) => {
    const next = new Set(expandedEndpoints);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpandedEndpoints(next);
  };

  const copyUrl = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedUrl(path);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  /* ── Service tabs ──────────────────────────────────────── */

  const serviceTabs = [
    { id: "all", label: "📋 All Services" },
    ...(services || []).map((s) => ({
      id: s.key,
      label: `${serviceIcons[s.key] || "📦"} ${s.name} (${s.endpointCount})`,
    })),
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="API Documentation"
        subtitle="Complete API reference for all Circuvent Platform services"
      />

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard title="Total Endpoints" value={stats.totalEndpoints} color="blue" />
          <StatCard title="Services" value={stats.totalServices} color="purple" />
          <StatCard title="GET" value={stats.byMethod.GET || 0} color="green" />
          <StatCard title="POST" value={stats.byMethod.POST || 0} color="blue" />
          <StatCard title="Auth Required" value={stats.authRequired} color="amber" />
        </div>
      )}

      {/* Service Tabs */}
      <Tabs tabs={serviceTabs} activeTab={activeService} onChange={setActiveService} />

      {/* Search */}
      <div className="flex gap-3">
        <Input
          placeholder="Search endpoints by path, description, or method..."
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          className="w-96"
        />
        <span className="text-sm text-slate-500 dark:text-slate-400 self-center">
          {filteredEndpoints.length} endpoint{filteredEndpoints.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Method Legend */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(methodColors).map(([method, color]) => (
          <div key={method} className="flex items-center gap-1">
            <Badge color={color}>{method}</Badge>
          </div>
        ))}
        <span className="text-xs text-slate-500 dark:text-slate-400 self-center ml-2">🔒 = Requires Authentication</span>
      </div>

      {/* Endpoint List */}
      {filteredEndpoints.length > 0 ? (
        <div className="space-y-2">
          {filteredEndpoints.map((ep, idx) => {
            const key = `${ep.method}-${ep.path}-${idx}`;
            const isExpanded = expandedEndpoints.has(key);

            return (
              <Card key={key} className="overflow-hidden">
                {/* Endpoint Header */}
                <div
                  className="flex items-center gap-3 cursor-pointer p-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded"
                  onClick={() => toggleEndpoint(key)}
                >
                  <Badge color={methodColors[ep.method] || "slate"} className="w-16 text-center font-mono text-xs">
                    {ep.method}
                  </Badge>
                  <code className="text-sm font-mono text-slate-900 dark:text-white flex-1">{ep.path}</code>
                  {ep.requiresAuth && <span title="Requires Authentication">🔒</span>}
                  <span className="text-sm text-slate-500 dark:text-slate-400 hidden md:block max-w-xs truncate">
                    {ep.description}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyUrl(ep.path); }}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    title="Copy URL"
                  >
                    {copiedUrl === ep.path ? "✅" : "📋"}
                  </button>
                  <span className="text-slate-400">{isExpanded ? "▲" : "▼"}</span>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-4">
                    <p className="text-sm text-slate-700 dark:text-slate-300">{ep.description}</p>

                    {/* Tags */}
                    <div className="flex gap-1">
                      {ep.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs rounded">
                          {tag}
                        </span>
                      ))}
                      {activeService === "all" && (
                        <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded">
                          {ep.serviceName}
                        </span>
                      )}
                    </div>

                    {/* Parameters */}
                    {ep.parameters.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Parameters</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                                <th className="pb-2 text-slate-500 font-medium">Name</th>
                                <th className="pb-2 text-slate-500 font-medium">In</th>
                                <th className="pb-2 text-slate-500 font-medium">Type</th>
                                <th className="pb-2 text-slate-500 font-medium">Required</th>
                                <th className="pb-2 text-slate-500 font-medium">Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ep.parameters.map((param) => (
                                <tr key={param.name} className="border-b border-slate-100 dark:border-slate-800">
                                  <td className="py-2 font-mono text-blue-600 dark:text-blue-400">{param.name}</td>
                                  <td className="py-2 text-slate-600 dark:text-slate-400">{param.in}</td>
                                  <td className="py-2 text-slate-600 dark:text-slate-400">{param.type}</td>
                                  <td className="py-2">
                                    {param.required
                                      ? <span className="text-red-600 dark:text-red-400 font-medium">Yes</span>
                                      : <span className="text-slate-400">No</span>
                                    }
                                  </td>
                                  <td className="py-2 text-slate-600 dark:text-slate-400">{param.description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Response Example */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Response Example</h4>
                      <pre className="bg-slate-900 dark:bg-slate-950 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
                        {JSON.stringify(ep.responseExample, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No endpoints found" description="Try adjusting your search or filter" />
      )}

      {/* Service Summaries (only when "all" selected and no search) */}
      {activeService === "all" && !searchQuery && services && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {services.map((svc) => (
            <div
              key={svc.key}
              onClick={() => setActiveService(svc.key)}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{serviceIcons[svc.key] || "📦"}</span>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{svc.name}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{svc.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-sm text-slate-600 dark:text-slate-400">{svc.endpointCount} endpoints</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">v{svc.version}</span>
                <code className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{svc.baseUrl}</code>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
