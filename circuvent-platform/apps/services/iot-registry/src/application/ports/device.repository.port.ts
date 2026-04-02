// ══════════════════════════════════════════════════════════════════════════════
// IoT Registry — Device Repository Port (Hexagonal)
// Abstract interface that the domain depends on. Infrastructure layer
// provides the concrete Prisma implementation.
// ══════════════════════════════════════════════════════════════════════════════

import { DeviceEntity } from "../../domain/entities/device.entity";

/**
 * Pagination options for queries.
 */
export interface PaginationOptions {
  page: number;
  limit: number;
}

/**
 * Filter criteria for searching devices.
 */
export interface DeviceFilter {
  status?: string;
  department?: string;
  projectId?: string;
  hardwareModel?: string;
  firmwareVersion?: string;
  search?: string;
}

/**
 * Paginated result set.
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Port: Device Repository.
 * The domain layer depends on this abstract interface.
 * The infrastructure layer provides the concrete implementation.
 *
 * @abstract
 */
export abstract class DeviceRepositoryPort {
  /** Finds a device by its unique ID */
  abstract findById(id: string): Promise<DeviceEntity | null>;

  /** Finds a device by its MAC address */
  abstract findByMacAddress(mac: string): Promise<DeviceEntity | null>;

  /** Finds a device by its device code */
  abstract findByDeviceCode(code: string): Promise<DeviceEntity | null>;

  /** Lists devices with filtering and pagination */
  abstract findAll(filter: DeviceFilter, pagination: PaginationOptions): Promise<PaginatedResult<DeviceEntity>>;

  /** Returns all devices with a specific firmware version */
  abstract findByFirmwareVersion(version: string): Promise<DeviceEntity[]>;

  /** Returns devices that haven't sent a heartbeat in N minutes */
  abstract findStaleDevices(minutesSinceHeartbeat: number): Promise<DeviceEntity[]>;

  /** Persists a new device */
  abstract save(device: DeviceEntity): Promise<void>;

  /** Updates an existing device */
  abstract update(device: DeviceEntity): Promise<void>;

  /** Generates the next device code (DEV-NNN) */
  abstract nextDeviceCode(): Promise<string>;

  /** Returns total device count by status for dashboards */
  abstract countByStatus(): Promise<Record<string, number>>;

  /** Returns firmware version distribution */
  abstract firmwareDistribution(): Promise<Array<{ version: string; count: number }>>;
}
