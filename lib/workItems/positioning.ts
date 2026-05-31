import { generateKeyBetween } from 'fractional-indexing';

// Fractional-indexing helpers for work-item ordering (Story 1.4).
//
// `position` orders siblings within a parent. Fractional indexing (the
// Linear/Notion shape) lets a reorder be a single-row write: to move an item
// between two neighbours you only mint a new key that sorts between their two
// keys — no cascade of re-numbering. Keys are opaque, lexicographically
// sortable strings (base-62 by default, e.g. "a0", "a0V", "Zz").
//
// These three helpers are thin, total wrappers over `generateKeyBetween`
// (which takes nullable bounds, where null means "open end"):
//   - keyForAppend(last)        → after the current last item (or first item)
//   - keyForPrepend(first)      → before the current first item (or first item)
//   - keyBetween(prev, next)    → between two existing neighbours
//
// The single source of truth for ordering correctness is `generateKeyBetween`
// itself; these wrappers only name the three call sites the service uses so
// the intent reads clearly at the call site. They throw (via the library) if
// given out-of-order bounds (prev >= next) — that's a programming error the
// service must avoid, not a runtime condition to swallow.

/**
 * A key that sorts AFTER `last` (the current last sibling's position), or the
 * first key in an empty list when `last` is null.
 */
export function keyForAppend(last: string | null): string {
  return generateKeyBetween(last, null);
}

/**
 * A key that sorts BEFORE `first` (the current first sibling's position), or
 * the first key in an empty list when `first` is null.
 */
export function keyForPrepend(first: string | null): string {
  return generateKeyBetween(null, first);
}

/**
 * A key that sorts strictly between `prev` and `next`. Either bound may be
 * null to mean "open end" (equivalent to append when `next` is null, prepend
 * when `prev` is null). Throws if `prev >= next`.
 */
export function keyBetween(prev: string | null, next: string | null): string {
  return generateKeyBetween(prev, next);
}
