// ══════════════════════════════════════════════════════════════════════════════
// Circuvent Platform — Result Monad Types
// Functional error handling without exceptions. Every domain operation returns
// Result<T, E> instead of throwing.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Represents the successful outcome of an operation.
 * @template T The type of the contained value
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
  readonly error?: never;
}

/**
 * Represents the failed outcome of an operation.
 * @template E The type of the error descriptor
 */
export interface Err<E> {
  readonly ok: false;
  readonly value?: never;
  readonly error: E;
}

/**
 * A discriminated union representing either success (Ok) or failure (Err).
 * Inspired by Rust's Result type - enforces explicit error handling.
 *
 * @example
 * ```ts
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return err("Division by zero");
 *   return ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (result.ok) {
 *   console.log(result.value); // 5
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export type Result<T, E = string> = Ok<T> | Err<E>;

/**
 * Creates a successful Result.
 * @param value The success value
 * @returns Ok<T>
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Creates a failed Result.
 * @param error The error descriptor
 * @returns Err<E>
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Wraps a potentially throwing function into a Result.
 * Converts exceptions into the Err branch.
 *
 * @param fn The function to execute
 * @returns Result<T, Error>
 *
 * @example
 * ```ts
 * const result = tryCatch(() => JSON.parse('invalid'));
 * // result.ok === false, result.error instanceof SyntaxError
 * ```
 */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Wraps an async function into a Result.
 * @param fn The async function to execute
 * @returns Promise<Result<T, Error>>
 */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Maps the success value of a Result.
 * If the Result is Err, passes it through unchanged.
 *
 * @param result The input Result
 * @param fn The mapping function
 * @returns A new Result with the mapped value
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) return ok(fn(result.value));
  return result;
}

/**
 * Chains Result-returning operations.
 * If the input is Err, short-circuits and returns Err.
 *
 * @param result The input Result
 * @param fn A function returning a new Result
 */
export function flatMapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  if (result.ok) return fn(result.value);
  return result;
}

/**
 * Unwraps a Result, throwing if it's an Err.
 * Use only when you're certain the Result is Ok.
 *
 * @param result The Result to unwrap
 * @param message Custom error message if unwrap fails
 * @throws Error if the Result is Err
 */
export function unwrap<T, E>(result: Result<T, E>, message?: string): T {
  if (result.ok) return result.value;
  throw new Error(message || `Unwrap failed: ${String(result.error)}`);
}

/**
 * Returns the value if Ok, or a default value if Err.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}
