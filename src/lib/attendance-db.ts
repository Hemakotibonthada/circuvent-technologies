import { neon } from "@neondatabase/serverless";

export function getAttendanceDatabase() {
  const connectionString =
    process.env.HRMS_DATABASE_URL ||
    process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Attendance database connection string (HRMS_DATABASE_URL or DATABASE_URL) is not configured.");
  }
  return neon(connectionString);
}
