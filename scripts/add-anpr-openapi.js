/**
 * Adds the ANPR surface to the published OpenAPI document.
 *
 * Written as a script rather than by hand-editing 30 KB of JSON so the shapes
 * stay consistent with the ones already in the file, and so re-running it after
 * a change is idempotent rather than a merge exercise.
 *
 * The document is a promise: `/v1` advertises it by URL, so an endpoint that
 * exists in the router and not here is an API a developer cannot discover.
 */
const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(__dirname, "..", "public", "openapi.json");
const doc = JSON.parse(fs.readFileSync(FILE, "utf8"));

const str = (extra = {}) => ({ type: "string", ...extra });
const nullableStr = { type: ["string", "null"] };
const int = (extra = {}) => ({ type: "integer", ...extra });
const bool = { type: "boolean" };
const dateTime = { type: "string", format: "date-time" };
const nullableDateTime = { type: ["string", "null"], format: "date-time" };
const nullableInt = { type: ["integer", "null"] };

const sec = (scope) => [{ ApiKeyAuth: [scope] }];
const ok = (description, schema) => ({
  200: { description, content: { "application/json": { schema } } },
});
const obj = (properties) => ({ type: "object", properties });
const arr = (items) => ({ type: "array", items });

const plateRead = obj({
  id: int(),
  deviceId: str(),
  captureId: int(),
  plate: nullableStr,
  formatted: { ...nullableStr, description: "Grouped for display, e.g. 'KA 01 AB 1234'." },
  confidence: int({ minimum: 0, maximum: 100 }),
  votes: int({ description: "Frames of the burst that produced this plate." }),
  samples: int({ description: "Frames the recogniser was run on." }),
  plateKind: str({ enum: ["standard", "bharat", "legacy", "unknown"] }),
  status: str({ enum: ["recognised", "unrecognised"] }),
  reason: {
    ...nullableStr,
    description:
      "Why an unrecognised read failed: no_recogniser, no_plate, invalid_format, timeout, provider_error.",
  },
  decision: str({ enum: ["allow", "deny", "watch", "unknown"] }),
  direction: {
    type: ["string", "null"],
    enum: ["in", "out", null],
    description: "Null when the lane's direction could not be resolved — never guessed.",
  },
  trigger: str({ enum: ["motion", "loop", "manual", "periodic"] }),
  hasImage: bool,
  imageUrl: nullableStr,
  at: dateTime,
});

const vehicle = obj({
  plate: str(),
  formatted: str(),
  passes: int(),
  entries: int(),
  exits: int(),
  visits: int(),
  inside: { ...bool, description: "Has an open visit: arrived and not yet seen leaving." },
  firstSeen: dateTime,
  lastSeen: dateTime,
  averageStaySeconds: nullableInt,
  totalStaySeconds: int(),
  cameras: arr(str()),
  list: { type: ["string", "null"], enum: ["allow", "deny", "watch", null] },
  label: nullableStr,
});

const visit = obj({
  id: int(),
  entryAt: nullableDateTime,
  exitAt: nullableDateTime,
  entryCamera: nullableStr,
  exitCamera: nullableStr,
  status: str({
    enum: ["open", "closed", "entry_missed", "exit_missed"],
    description:
      "Gate cameras miss reads. entry_missed and exit_missed are normal states, not errors — pairing resynchronises at the next clean read.",
  }),
  staySeconds: {
    ...nullableInt,
    description:
      "Null, never 0, when a read was missed. A fabricated duration is worse than an absent one for anything billed or audited.",
  },
});

const plateRule = obj({
  id: int(),
  plate: str(),
  formatted: str(),
  kind: str({ enum: ["allow", "deny", "watch"] }),
  label: str(),
  deviceId: nullableStr,
  validFrom: nullableDateTime,
  validTo: nullableDateTime,
  enabled: bool,
  hits: int(),
});

doc.paths["/v1/plates"] = {
  get: {
    tags: ["ANPR"],
    operationId: "listPlateReads",
    summary: "Number-plate reads",
    description:
      "One row per sighting. The capture image is advertised rather than inlined: a page of 100 reads stays a few KB, and most rows are never opened.",
    security: sec("plates:read"),
    parameters: [
      { name: "deviceId", in: "query", schema: str() },
      {
        name: "plate",
        in: "query",
        description: "Normalised on the way in, so 'KA 01 AB 1234' and 'ka-01-ab-1234' both work.",
        schema: str(),
      },
      { name: "decision", in: "query", schema: str({ enum: ["allow", "deny", "watch", "unknown"] }) },
      { name: "status", in: "query", schema: str({ enum: ["recognised", "unrecognised"] }) },
      { name: "since", in: "query", schema: dateTime },
      { name: "limit", in: "query", schema: int({ minimum: 1, maximum: 500, default: 50 }) },
    ],
    responses: {
      ...ok("Reads, newest first.", obj({ plates: arr(plateRead) })),
      400: { $ref: "#/components/responses/BadRequest" },
    },
  },
};

doc.paths["/v1/plates/{id}/image"] = {
  get: {
    tags: ["ANPR"],
    operationId: "getPlateReadImage",
    summary: "The capture a plate was read from",
    description:
      "Real image/jpeg rather than base64 in JSON, so it caches and can be pointed at directly. Images expire before the metadata does — see ANPR_IMAGE_RETENTION_DAYS.",
    security: sec("plates:read"),
    parameters: [{ name: "id", in: "path", required: true, schema: int() }],
    responses: {
      200: { description: "The JPEG.", content: { "image/jpeg": { schema: { type: "string", format: "binary" } } } },
      404: { $ref: "#/components/responses/NotFound" },
    },
  },
};

doc.paths["/v1/vehicles"] = {
  get: {
    tags: ["ANPR"],
    operationId: "listVehicles",
    summary: "The vehicle register",
    description:
      "One row per distinct plate rather than per sighting. 'How often does this van come, and is it here now' cannot be answered by paging /v1/plates.",
    security: sec("plates:read"),
    parameters: [
      { name: "days", in: "query", schema: int({ minimum: 1, maximum: 365, default: 30 }) },
      { name: "limit", in: "query", schema: int({ minimum: 1, maximum: 1000, default: 200 }) },
    ],
    responses: ok(
      "Vehicles, most recently seen first.",
      obj({ days: int(), insideNow: int(), vehicles: arr(vehicle) })
    ),
  },
};

doc.paths["/v1/vehicles/{plate}"] = {
  get: {
    tags: ["ANPR"],
    operationId: "getVehicle",
    summary: "One vehicle's visit history",
    description:
      "404 rather than an empty profile when the plate has never been seen — 'came zero times' reads like a working answer to what is actually a typo.",
    security: sec("plates:read"),
    parameters: [
      {
        name: "plate",
        in: "path",
        required: true,
        description: "Normalised on the way in; spacing and dashes do not matter.",
        schema: str(),
      },
    ],
    responses: {
      ...ok(
        "The vehicle and every visit.",
        obj({
          plate: str(),
          formatted: str(),
          passes: int(),
          inside: bool,
          totalStaySeconds: int(),
          visits: arr(visit),
        })
      ),
      404: { $ref: "#/components/responses/NotFound" },
    },
  },
};

doc.paths["/v1/occupancy"] = {
  get: {
    tags: ["ANPR"],
    operationId: "getOccupancy",
    summary: "How full the site is right now",
    description:
      "Counted from open visits, never tallied — a running total is biased permanently by one missed read. Capacity is reported, never enforced: the gate still opens for an allowed vehicle when the site is full.",
    security: sec("plates:read"),
    responses: ok(
      "Live site state.",
      obj({
        inside: int(),
        capacity: { ...nullableInt, description: "Null when capacity is not managed — different from zero." },
        free: nullableInt,
        full: bool,
        percent: nullableInt,
      })
    ),
  },
};

doc.paths["/v1/plate-rules"] = {
  get: {
    tags: ["ANPR"],
    operationId: "listPlateRules",
    summary: "The allow / deny / watch list",
    security: sec("plates:read"),
    responses: ok("Rules.", obj({ rules: arr(plateRule) })),
  },
  post: {
    tags: ["ANPR"],
    operationId: "createPlateRule",
    summary: "Put a plate on a list",
    description:
      "The plate is validated and corrected by the same analyser a camera read goes through, so a rule and a read of the same vehicle can never be different strings. Deny wins over allow.",
    security: sec("plates:write"),
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["plate"],
            properties: {
              plate: str({ description: "Spacing and dashes are accepted." }),
              kind: str({ enum: ["allow", "deny", "watch"], default: "allow" }),
              label: str({ maxLength: 80 }),
              deviceId: { ...nullableStr, description: "Null applies the rule to every ANPR camera on the account." },
              validFrom: nullableDateTime,
              validTo: { ...nullableDateTime, description: "For a contractor or a visitor." },
            },
          },
        },
      },
    },
    responses: {
      201: { description: "Created.", content: { "application/json": { schema: obj({ rule: plateRule }) } } },
      400: { $ref: "#/components/responses/BadRequest" },
      409: { description: "That plate is already on a list for this scope." },
    },
  },
};

doc.paths["/v1/plate-rules/{id}"] = {
  delete: {
    tags: ["ANPR"],
    operationId: "deletePlateRule",
    summary: "Remove a plate from its list",
    security: sec("plates:write"),
    parameters: [{ name: "id", in: "path", required: true, schema: int() }],
    responses: {
      ...ok("Deleted.", obj({ deleted: bool })),
      404: { $ref: "#/components/responses/NotFound" },
    },
  },
};

// Tag description, so the section is not an unexplained heading in a renderer.
doc.tags = doc.tags ?? [];
if (!doc.tags.some((t) => t.name === "ANPR")) {
  doc.tags.push({
    name: "ANPR",
    description:
      "Number-plate reads, the vehicle register and site occupancy. Scoped separately from telemetry: a plate log is a record of which vehicles came to a property, about people who are not the account holder.",
  });
}

fs.writeFileSync(FILE, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`openapi.json now documents ${Object.keys(doc.paths).length} paths`);
