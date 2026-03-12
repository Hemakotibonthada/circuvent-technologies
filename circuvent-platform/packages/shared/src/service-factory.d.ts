import { Express, Router } from "express";
export interface ServiceConfig {
    name: string;
    port: number;
}
/**
 * Creates a pre-configured Express app for a microservice.
 * Each service receives user info via headers from the API Gateway.
 */
export declare function createService(config: ServiceConfig): Express;
/**
 * Starts the microservice and logs the startup banner.
 */
export declare function startService(app: Express, config: ServiceConfig): void;
/**
 * Creates a typed router for a service module.
 */
export declare function createRouter(): Router;
//# sourceMappingURL=service-factory.d.ts.map