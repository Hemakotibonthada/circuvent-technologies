"use strict";
// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Base Express Service Factory
// Shared bootstrap for all microservices.
// ──────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createService = createService;
exports.startService = startService;
exports.createRouter = createRouter;
const express_1 = __importStar(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
/**
 * Creates a pre-configured Express app for a microservice.
 * Each service receives user info via headers from the API Gateway.
 */
function createService(config) {
    const app = (0, express_1.default)();
    // ── Middleware ──
    app.use((0, helmet_1.default)());
    app.use((0, compression_1.default)());
    app.use((0, cors_1.default)());
    app.use((0, morgan_1.default)("short"));
    app.use(express_1.default.json({ limit: "10mb" }));
    app.use(express_1.default.urlencoded({ extended: true }));
    // ── Extract user from gateway-forwarded headers ──
    app.use((req, _res, next) => {
        const userId = req.headers["x-user-id"];
        const userEmail = req.headers["x-user-email"];
        const userRole = req.headers["x-user-role"];
        if (userId) {
            req.user = {
                userId,
                email: userEmail,
                role: userRole,
            };
        }
        next();
    });
    // ── Health check ──
    app.get("/health", (_req, res) => {
        res.json({
            success: true,
            data: {
                service: config.name,
                status: "healthy",
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
            },
        });
    });
    return app;
}
/**
 * Starts the microservice and logs the startup banner.
 */
function startService(app, config) {
    app.listen(config.port, () => {
        console.log(`  [${config.name}] Running on http://localhost:${config.port}`);
    });
}
/**
 * Creates a typed router for a service module.
 */
function createRouter() {
    return (0, express_1.Router)();
}
//# sourceMappingURL=service-factory.js.map