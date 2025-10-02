const s = 1000;
const m = s * 60;
const h = m * 60;
const d = h * 24;
const w = d * 7;
const y = d * 365.25;
const mo = y / 12;

type Years = 'years' | 'year' | 'yrs' | 'yr' | 'y';
type Months = 'months' | 'month' | 'mo';
type Weeks = 'weeks' | 'week' | 'w';
type Days = 'days' | 'day' | 'd';
type Hours = 'hours' | 'hour' | 'hrs' | 'hr' | 'h';
type Minutes = 'minutes' | 'minute' | 'mins' | 'min' | 'm';
type Seconds = 'seconds' | 'second' | 'secs' | 'sec' | 's';
type Milliseconds = 'milliseconds' | 'millisecond' | 'msecs' | 'msec' | 'ms';
type Unit =
  | Years
  | Months
  | Weeks
  | Days
  | Hours
  | Minutes
  | Seconds
  | Milliseconds;

type UnitAnyCase = Capitalize<Unit> | Uppercase<Unit> | Unit;

// OPTIMIZATION: Pre-compiled regex pattern (executed once instead of on every parse)
const parseRegex = /^(?<value>-?\d*\.?\d+) *(?<unit>milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mo|years?|yrs?|y)?$/i;

// OPTIMIZATION: LRU Cache for parsed values
class LRUCache {
  private cache: Map<string, number>;
  private maxSize: number;

  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: string): number | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: number): void {
    // Remove if already exists to re-insert at end
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // If at capacity, remove oldest (first) entry
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

const parseCache = new LRUCache(100);

// OPTIMIZATION: Lookup table for common exact values (instant lookup)
const commonValues: Record<string, number> = {
  // Most common patterns without spaces
  '1s': 1000,
  '2s': 2000,
  '5s': 5000,
  '10s': 10000,
  '15s': 15000,
  '30s': 30000,
  '1m': 60000,
  '2m': 120000,
  '5m': 300000,
  '10m': 600000,
  '15m': 900000,
  '30m': 1800000,
  '1h': 3600000,
  '2h': 7200000,
  '3h': 10800000,
  '6h': 21600000,
  '12h': 43200000,
  '1d': 86400000,
  '2d': 172800000,
  '7d': 604800000,
  '1w': 604800000,
  '2w': 1209600000,
  '1mo': 2629800000,
  '1y': 31557600000,

  // With spaces
  '1 s': 1000,
  '1 m': 60000,
  '1 h': 3600000,
  '1 d': 86400000,
  '1 w': 604800000,

  // Just numbers (default to ms)
  '100': 100,
  '1000': 1000,
  '5000': 5000,
};

// OPTIMIZATION: Unit lookup table for fast switch replacement
const unitMultipliers: Record<string, number> = {
  'years': y, 'year': y, 'yrs': y, 'yr': y, 'y': y,
  'months': mo, 'month': mo, 'mo': mo,
  'weeks': w, 'week': w, 'w': w,
  'days': d, 'day': d, 'd': d,
  'hours': h, 'hour': h, 'hrs': h, 'hr': h, 'h': h,
  'minutes': m, 'minute': m, 'mins': m, 'min': m, 'm': m,
  'seconds': s, 'second': s, 'secs': s, 'sec': s, 's': s,
  'milliseconds': 1, 'millisecond': 1, 'msecs': 1, 'msec': 1, 'ms': 1,
};

export type StringValue =
  | `${number}`
  | `${number}${UnitAnyCase}`
  | `${number} ${UnitAnyCase}`;

interface Options {
  /**
   * Set to `true` to use verbose formatting. Defaults to `false`.
   */
  long?: boolean;
}

/**
 * Parse or format the given value.
 *
 * @param value - The string or number to convert
 * @param options - Options for the conversion
 * @throws Error if `value` is not a non-empty string or a number
 */
export function ms(value: StringValue, options?: Options): number;
export function ms(value: number, options?: Options): string;
export function ms(
  value: StringValue | number,
  options?: Options,
): number | string {
  if (typeof value === 'string') {
    return parse(value);
  } else if (typeof value === 'number') {
    return format(value, options);
  }
  throw new Error(
    `Value provided to ms() must be a string or number. value=${JSON.stringify(value)}`,
  );
}

/**
 * Parse the given string and return milliseconds.
 *
 * @param str - A string to parse to milliseconds
 * @returns The parsed value in milliseconds, or `NaN` if the string can't be
 * parsed
 */
export function parse(str: string): number {
  if (typeof str !== 'string' || str.length === 0 || str.length > 100) {
    throw new Error(
      `Value provided to ms.parse() must be a string with length between 1 and 99. value=${JSON.stringify(str)}`,
    );
  }

  // OPTIMIZATION: Check cache first
  const cached = parseCache.get(str);
  if (cached !== undefined) {
    return cached;
  }

  // OPTIMIZATION: Fast path - check common values lookup table
  const commonValue = commonValues[str];
  if (commonValue !== undefined) {
    parseCache.set(str, commonValue);
    return commonValue;
  }

  // OPTIMIZATION: Use pre-compiled regex instead of inline regex
  const match = parseRegex.exec(str);

  if (!match?.groups) {
    return NaN;
  }

  // Named capture groups need to be manually typed today.
  // https://github.com/microsoft/TypeScript/issues/32098
  const { value, unit = 'ms' } = match.groups as {
    value: string;
    unit: string | undefined;
  };

  const n = parseFloat(value);
  const matchUnit = unit.toLowerCase();

  // OPTIMIZATION: Use lookup table instead of switch statement
  const multiplier = unitMultipliers[matchUnit];

  if (multiplier === undefined) {
    throw new Error(
      `Unknown unit "${matchUnit}" provided to ms.parse(). value=${JSON.stringify(str)}`,
    );
  }

  const result = n * multiplier;

  // Cache the result for future use
  parseCache.set(str, result);

  return result;
}

/**
 * Parse the given StringValue and return milliseconds.
 *
 * @param value - A typesafe StringValue to parse to milliseconds
 * @returns The parsed value in milliseconds, or `NaN` if the string can't be
 * parsed
 */
export function parseStrict(value: StringValue): number {
  return parse(value);
}

/**
 * Short format for `ms`.
 */
function fmtShort(ms: number): StringValue {
  const msAbs = Math.abs(ms);
  if (msAbs >= y) {
    return `${Math.round(ms / y)}y`;
  }
  if (msAbs >= mo) {
    return `${Math.round(ms / mo)}mo`;
  }
  if (msAbs >= w) {
    return `${Math.round(ms / w)}w`;
  }
  if (msAbs >= d) {
    return `${Math.round(ms / d)}d`;
  }
  if (msAbs >= h) {
    return `${Math.round(ms / h)}h`;
  }
  if (msAbs >= m) {
    return `${Math.round(ms / m)}m`;
  }
  if (msAbs >= s) {
    return `${Math.round(ms / s)}s`;
  }
  return `${ms}ms`;
}

/**
 * Long format for `ms`.
 */
function fmtLong(ms: number): StringValue {
  const msAbs = Math.abs(ms);
  if (msAbs >= y) {
    return plural(ms, msAbs, y, 'year');
  }
  if (msAbs >= mo) {
    return plural(ms, msAbs, mo, 'month');
  }
  if (msAbs >= w) {
    return plural(ms, msAbs, w, 'week');
  }
  if (msAbs >= d) {
    return plural(ms, msAbs, d, 'day');
  }
  if (msAbs >= h) {
    return plural(ms, msAbs, h, 'hour');
  }
  if (msAbs >= m) {
    return plural(ms, msAbs, m, 'minute');
  }
  if (msAbs >= s) {
    return plural(ms, msAbs, s, 'second');
  }
  return `${ms} ms`;
}

/**
 * Format the given integer as a string.
 *
 * @param ms - milliseconds
 * @param options - Options for the conversion
 * @returns The formatted string
 */
export function format(ms: number, options?: Options): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw new Error('Value provided to ms.format() must be of type number.');
  }

  return options?.long ? fmtLong(ms) : fmtShort(ms);
}

/**
 * Pluralization helper.
 */
function plural(
  ms: number,
  msAbs: number,
  n: number,
  name: string,
): StringValue {
  const isPlural = msAbs >= n * 1.5;
  return `${Math.round(ms / n)} ${name}${isPlural ? 's' : ''}` as StringValue;
}
