// Constants shared by the service worker and the extension pages.

// Hidden developer flag. Leave this false for real use.
// When true: one "minute" of limit lasts one second, the 24 hour delay on
// loosening changes shrinks to one minute, and the worker ticks every second.
// It only works in an unpacked extension (Chrome lets those use fast alarms).
export const DEV_FAST_MODE = false;

const fast = DEV_FAST_MODE;

/** Length of one "minute" of limit, in milliseconds. */
export const UNIT_MS = fast ? 1000 : 60_000;
export const UNIT_SHORT = fast ? 's' : 'min';
export const UNIT_LONG = fast ? 'second' : 'minute';

/** Length of one "hour" of loosening delay. 24 of these is one minute in fast mode. */
export const DELAY_HOUR_MS = fast ? 2500 : 3_600_000;

/** How often the worker wakes to bank elapsed time while a tracked site is open. */
export const TICK_MS = fast ? 1000 : 30_000;

/**
 * The most time one flush may add. Anything longer means the worker could not
 * run (computer asleep, Chrome frozen), so the surplus is not usage.
 */
export const MAX_GAP_MS = fast ? 5000 : 70_000;

/** Seconds without input before the user counts as idle. */
export const IDLE_SECONDS = 60;

/** Warn when this many units remain. */
export const WARN_UNITS = [5, 1];

/** Usage key for YouTube entertainment time. Never a valid domain. */
export const YT_KEY = '@youtube';
export const YT_NAME = 'YouTube entertainment';

/** How long a watch page may stay unclassified before it is treated as entertainment. */
export const CLASSIFY_GRACE_MS = 10_000;

/** A typing challenge must be finished within this time. */
export const CHALLENGE_TTL_MS = 30 * 60_000;

/** If the clock sits this far before the stored day, the stored day is unusable. */
export const REANCHOR_MS = 36 * 3_600_000;

export const LIMIT_MAX = 1440;
export const FRICTION_BOUNDS = {
  challengeLength: { min: 10, max: 1000, default: 10 },
  // A delay of 0 applies a loosening change as soon as the challenge is typed.
  delayHours: { min: 0, max: 168, default: 0 },
};
