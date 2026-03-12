// ──────────────────────────────────────────────────────────────
// Circuvent Platform — File Handling Utilities
// Validation, MIME detection, CSV parsing/generation,
// filename sanitization, file size formatting, thumbnails.
// ──────────────────────────────────────────────────────────────

import crypto from "crypto";
import path from "path";

// ══════════════════════════════════════════════════════════════
// MIME Types
// ══════════════════════════════════════════════════════════════

const MIME_MAP: Record<string, string> = {
  // Documents
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".rtf": "application/rtf",
  ".odt": "application/vnd.oasis.opendocument.text",
  // Images
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  // Video
  ".mp4": "video/mp4",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  // Archives
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  // Code/Data
  ".json": "application/json",
  ".xml": "application/xml",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".md": "text/markdown",
};

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".bmp", ".ico", ".tiff", ".tif"]);
const DOCUMENT_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".rtf", ".odt"]);

// ══════════════════════════════════════════════════════════════
// Validation
// ══════════════════════════════════════════════════════════════

/**
 * Validate that a file has an allowed extension.
 */
export function validateFileType(
  filename: string,
  allowedTypes: string[],
): { valid: boolean; extension: string; error?: string } {
  const ext = getFileExtension(filename);

  if (!ext) {
    return { valid: false, extension: "", error: "File has no extension" };
  }

  const normalizedAllowed = allowedTypes.map((t) =>
    t.startsWith(".") ? t.toLowerCase() : `.${t.toLowerCase()}`,
  );

  if (!normalizedAllowed.includes(ext)) {
    return {
      valid: false,
      extension: ext,
      error: `File type '${ext}' is not allowed. Accepted: ${normalizedAllowed.join(", ")}`,
    };
  }

  return { valid: true, extension: ext };
}

/**
 * Validate that file size is within the allowed limit.
 */
export function validateFileSize(
  bytes: number,
  maxMB: number,
): { valid: boolean; sizeMB: number; error?: string } {
  const sizeMB = bytes / (1024 * 1024);

  if (bytes < 0) {
    return { valid: false, sizeMB: 0, error: "Invalid file size" };
  }

  if (sizeMB > maxMB) {
    return {
      valid: false,
      sizeMB: Math.round(sizeMB * 100) / 100,
      error: `File size (${formatFileSize(bytes)}) exceeds maximum (${maxMB} MB)`,
    };
  }

  return { valid: true, sizeMB: Math.round(sizeMB * 100) / 100 };
}

// ══════════════════════════════════════════════════════════════
// Filename Utilities
// ══════════════════════════════════════════════════════════════

/**
 * Generate a unique filename preserving the original extension.
 */
export function generateUniqueFilename(originalName: string): string {
  const ext = getFileExtension(originalName);
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(6).toString("hex");
  const baseName = sanitizeFilename(
    path.basename(originalName, ext),
  ).substring(0, 32);

  return `${baseName}_${timestamp}_${random}${ext}`;
}

/**
 * Get the file extension (lowercase, including dot).
 */
export function getFileExtension(filename: string): string {
  if (!filename) return "";
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) return "";
  return filename.substring(lastDot).toLowerCase();
}

/**
 * Get MIME type from filename.
 */
export function getMimeType(filename: string): string {
  const ext = getFileExtension(filename);
  return MIME_MAP[ext] || "application/octet-stream";
}

/**
 * Sanitize a filename: remove dangerous characters, collapse spaces.
 */
export function sanitizeFilename(name: string): string {
  if (!name) return "unnamed";
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "") // Remove illegal chars
    .replace(/\.\./g, ".") // No directory traversal
    .replace(/\s+/g, "_") // Spaces to underscores
    .replace(/^\.+/, "") // No leading dots  
    .replace(/_+/g, "_") // Collapse underscores
    .trim() || "unnamed";
}

// ══════════════════════════════════════════════════════════════
// File Size Formatting
// ══════════════════════════════════════════════════════════════

/**
 * Format bytes to human-readable size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, units.length - 1);
  const size = bytes / Math.pow(k, index);

  return `${Math.round(size * 100) / 100} ${units[index]}`;
}

// ══════════════════════════════════════════════════════════════
// File Type Checks
// ══════════════════════════════════════════════════════════════

/**
 * Check if a file is an image based on extension.
 */
export function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(getFileExtension(filename));
}

/**
 * Check if a file is a document based on extension.
 */
export function isDocumentFile(filename: string): boolean {
  return DOCUMENT_EXTENSIONS.has(getFileExtension(filename));
}

// ══════════════════════════════════════════════════════════════
// Thumbnail URL
// ══════════════════════════════════════════════════════════════

/**
 * Generate a thumbnail URL for an image file.
 * Placeholder implementation — in production, use an image resizing service.
 */
export function generateThumbnailURL(
  fileURL: string,
  width: number = 200,
  height: number = 200,
): string {
  if (!fileURL) return "";

  // If it's already a thumbnail, return as-is
  if (fileURL.includes("thumbnail") || fileURL.includes("thumb")) {
    return fileURL;
  }

  // Build thumbnail URL based on convention
  const ext = getFileExtension(fileURL);
  const base = fileURL.substring(0, fileURL.length - ext.length);
  return `${base}_thumb_${width}x${height}${ext}`;
}

// ══════════════════════════════════════════════════════════════
// CSV Parsing & Generation
// ══════════════════════════════════════════════════════════════

/**
 * Parse a CSV string into an array of objects.
 * @param csvString - Raw CSV content
 * @param headers - Optional headers; if not provided, first row is used
 */
export function parseCSVToJSON(
  csvString: string,
  headers?: string[],
): Array<Record<string, string>> {
  if (!csvString || !csvString.trim()) return [];

  const lines = csvString.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const columnHeaders = headers || parseRow(lines[0]);
  const startRow = headers ? 0 : 1;
  const results: Array<Record<string, string>> = [];

  for (let i = startRow; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < columnHeaders.length; j++) {
      row[columnHeaders[j]] = values[j] || "";
    }
    results.push(row);
  }

  return results;
}

/**
 * Generate a CSV string from an array of objects.
 * @param data - Array of objects
 * @param columns - Column definitions with key and optional header label
 */
export function generateCSVFromJSON(
  data: Array<Record<string, any>>,
  columns: Array<{ key: string; header?: string }>,
): string {
  if (!data || data.length === 0 || !columns || columns.length === 0) {
    return "";
  }

  const escapeCSVField = (value: any): string => {
    const str = value === null || value === undefined ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerRow = columns.map((c) => escapeCSVField(c.header || c.key)).join(",");
  const dataRows = data.map((row) =>
    columns.map((c) => escapeCSVField(row[c.key])).join(","),
  );

  return [headerRow, ...dataRows].join("\n");
}
