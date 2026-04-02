// ══════════════════════════════════════════════════════════════════════════════
// IoT Registry — Register Device Use Case (Application Layer)
// Orchestrates the device registration business logic.
// Depends ONLY on ports — never on infrastructure directly.
// ══════════════════════════════════════════════════════════════════════════════

import { DeviceEntity } from "../../domain/entities/device.entity";
import { DeviceRepositoryPort } from "../ports/device.repository.port";

/**
 * Input DTO for device registration.
 */
export interface RegisterDeviceInput {
  name: string;
  macAddress: string;
  firmwareVersion: string;
  hardwareModel?: string;
  location?: string;
  ipAddress?: string;
  projectId?: string;
}

/**
 * Output DTO after successful registration.
 */
export interface RegisterDeviceOutput {
  id: string;
  deviceCode: string;
  name: string;
  macAddress: string;
  firmwareVersion: string;
  status: string;
}

/**
 * Use Case: Register a new IoT device in the system.
 *
 * Business Rules:
 * 1. MAC address must be unique across all devices
 * 2. Device code is auto-generated (DEV-001, DEV-002, ...)
 * 3. Initial status is REGISTERED
 * 4. Emits DeviceRegistered domain event
 *
 * @example
 * ```ts
 * const useCase = new RegisterDeviceUseCase(deviceRepo);
 * const result = await useCase.execute({
 *   name: "Temperature Sensor Alpha",
 *   macAddress: "AA:BB:CC:DD:EE:FF",
 *   firmwareVersion: "1.0.0",
 *   hardwareModel: "ESP32-WROOM",
 * });
 * ```
 */
export class RegisterDeviceUseCase {
  constructor(private readonly deviceRepo: DeviceRepositoryPort) {}

  /**
   * Executes the device registration.
   *
   * @param input Registration data
   * @returns The registered device details
   * @throws Error if MAC address is already registered
   */
  async execute(input: RegisterDeviceInput): Promise<RegisterDeviceOutput> {
    // Rule 1: Check MAC address uniqueness
    const existingDevice = await this.deviceRepo.findByMacAddress(input.macAddress);
    if (existingDevice) {
      throw new Error(
        `Device with MAC address '${input.macAddress}' is already registered ` +
        `as '${existingDevice.name}' (${existingDevice.deviceCode})`
      );
    }

    // Rule 2: Generate next device code
    const deviceCode = await this.deviceRepo.nextDeviceCode();

    // Create domain entity (validates MAC, firmware version internally)
    const device = new DeviceEntity({
      id: generateId(),
      name: input.name,
      deviceCode,
      macAddress: input.macAddress,
      firmwareVersion: input.firmwareVersion,
      status: "REGISTERED",
      hardwareModel: input.hardwareModel || null,
      location: input.location || null,
      ipAddress: input.ipAddress || null,
      projectId: input.projectId || null,
    });

    // Persist
    await this.deviceRepo.save(device);

    return {
      id: device.id,
      deviceCode: device.deviceCode,
      name: device.name,
      macAddress: device.macAddress.toString(),
      firmwareVersion: device.firmwareVersion.toString(),
      status: device.status.toString(),
    };
  }
}

/** Simple ID generator (in production would use CUID2) */
function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `dev_${ts}_${rand}`;
}
