// GENERATED FILE — do not edit.
//
// Written by scripts/generate-developer-docs.cjs from public/openapi.json,
// which is the description the API server is built against. Edit the
// specification and re-run the script; `developer-docs-parity.test.ts`
// regenerates this and fails if the two disagree.

export interface ApiEndpoint {
  method: string;
  path: string;
  /** The scope the server requires, or null where the endpoint is open. */
  scope: string | null;
  summary: string;
  tag: string;
}

export interface ApiTag {
  name: string;
  description: string;
}

export const API_VERSION = "1.0.0";
export const API_SERVERS: string[] = [
  "https://api.circuvent.com"
];
export const API_TAGS: ApiTag[] = [
  {
    "name": "Discovery",
    "description": "Index and credential introspection."
  },
  {
    "name": "Devices",
    "description": "Read state and send commands."
  },
  {
    "name": "Telemetry",
    "description": "Historical series."
  },
  {
    "name": "Organisation",
    "description": "Rooms, scenes, automations and events."
  },
  {
    "name": "ANPR",
    "description": "Number-plate reads, the vehicle register and site occupancy. Scoped separately from telemetry: a plate log is a record of which vehicles came to a property, about people who are not the account holder."
  }
];

/** Every scope the specification requires anywhere. */
export const API_SCOPES: string[] = [
  "automations:read",
  "automations:write",
  "devices:control",
  "devices:read",
  "devices:write",
  "events:read",
  "plates:read",
  "plates:write",
  "rooms:read",
  "scenes:read",
  "scenes:run",
  "telemetry:read"
];

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    "method": "GET",
    "path": "/v1",
    "scope": null,
    "summary": "API index",
    "tag": "Discovery"
  },
  {
    "method": "GET",
    "path": "/v1/automations",
    "scope": "automations:read",
    "summary": "List automation rules",
    "tag": "Organisation"
  },
  {
    "method": "POST",
    "path": "/v1/automations",
    "scope": "automations:write",
    "summary": "Create an automation rule",
    "tag": "Organisation"
  },
  {
    "method": "DELETE",
    "path": "/v1/automations/{id}",
    "scope": "automations:write",
    "summary": "Delete a rule",
    "tag": "Organisation"
  },
  {
    "method": "PATCH",
    "path": "/v1/automations/{id}",
    "scope": "automations:write",
    "summary": "Update or enable/disable a rule",
    "tag": "Organisation"
  },
  {
    "method": "GET",
    "path": "/v1/devices",
    "scope": "devices:read",
    "summary": "List devices",
    "tag": "Devices"
  },
  {
    "method": "GET",
    "path": "/v1/devices/{id}",
    "scope": "devices:read",
    "summary": "Get one device",
    "tag": "Devices"
  },
  {
    "method": "PATCH",
    "path": "/v1/devices/{id}",
    "scope": "devices:write",
    "summary": "Rename, assign a room, or set favourite",
    "tag": "Devices"
  },
  {
    "method": "POST",
    "path": "/v1/devices/{id}/commands",
    "scope": "devices:control",
    "summary": "Send a command",
    "tag": "Devices"
  },
  {
    "method": "GET",
    "path": "/v1/devices/{id}/energy",
    "scope": "telemetry:read",
    "summary": "Bucketed energy series",
    "tag": "Telemetry"
  },
  {
    "method": "GET",
    "path": "/v1/devices/{id}/telemetry",
    "scope": "telemetry:read",
    "summary": "Telemetry history",
    "tag": "Telemetry"
  },
  {
    "method": "GET",
    "path": "/v1/events",
    "scope": "events:read",
    "summary": "Event and activity feed",
    "tag": "Organisation"
  },
  {
    "method": "GET",
    "path": "/v1/me",
    "scope": "devices:read",
    "summary": "Identify this credential",
    "tag": "Discovery"
  },
  {
    "method": "GET",
    "path": "/v1/occupancy",
    "scope": "plates:read",
    "summary": "How full the site is right now",
    "tag": "ANPR"
  },
  {
    "method": "GET",
    "path": "/v1/plate-rules",
    "scope": "plates:read",
    "summary": "The allow / deny / watch list",
    "tag": "ANPR"
  },
  {
    "method": "POST",
    "path": "/v1/plate-rules",
    "scope": "plates:write",
    "summary": "Put a plate on a list",
    "tag": "ANPR"
  },
  {
    "method": "DELETE",
    "path": "/v1/plate-rules/{id}",
    "scope": "plates:write",
    "summary": "Remove a plate from its list",
    "tag": "ANPR"
  },
  {
    "method": "GET",
    "path": "/v1/plates",
    "scope": "plates:read",
    "summary": "Number-plate reads",
    "tag": "ANPR"
  },
  {
    "method": "GET",
    "path": "/v1/plates/{id}/image",
    "scope": "plates:read",
    "summary": "The capture a plate was read from",
    "tag": "ANPR"
  },
  {
    "method": "GET",
    "path": "/v1/rooms",
    "scope": "rooms:read",
    "summary": "List rooms",
    "tag": "Organisation"
  },
  {
    "method": "GET",
    "path": "/v1/scenes",
    "scope": "scenes:read",
    "summary": "List scenes",
    "tag": "Organisation"
  },
  {
    "method": "POST",
    "path": "/v1/scenes/{id}/activate",
    "scope": "scenes:run",
    "summary": "Run a scene",
    "tag": "Organisation"
  },
  {
    "method": "GET",
    "path": "/v1/vehicles",
    "scope": "plates:read",
    "summary": "The vehicle register",
    "tag": "ANPR"
  },
  {
    "method": "GET",
    "path": "/v1/vehicles/{plate}",
    "scope": "plates:read",
    "summary": "One vehicle's visit history",
    "tag": "ANPR"
  }
];
