'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { signIn } from '@/lib/auth/client';

/**
 * "Continue with Google" button — used on /sign-in (both steps) and /sign-up.
 *
 * Triggers Better-Auth's OAuth flow via `authClient.signIn.social`. The
 * SDK returns a redirect URL; the browser navigates to Google, then back
 * through `/api/auth/callback/google`, then to `callbackURL`. We show a
 * spinner from click → navigation start (mockup 08); the spinner stays
 * on if the redirect throws so the user sees what went wrong via the
 * `onError` prop's parent-level alert.
 *
 * The label flips between "Sign in" and "Sign up" wording so the same
 * component reads correctly on either page (mockups 01 vs 03).
 */
export function GoogleButton({
  callbackURL,
  label,
  onError,
}: {
  callbackURL: string;
  label: 'sign-in' | 'sign-up';
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    onError('');
    try {
      const result = await signIn.social({ provider: 'google', callbackURL });
      // Better-Auth's React client returns `{ data, error }` — if error is
      // populated the redirect never happened, so we surface it inline.
      if (result?.error) {
        setLoading(false);
        onError(humanizeOAuthError(result.error.message ?? null));
      }
      // Success path: the browser is already navigating to Google's consent
      // screen, so leave `loading=true` until the unload tears us down.
    } catch (err) {
      setLoading(false);
      onError(humanizeOAuthError(err instanceof Error ? err.message : null));
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="w-full"
      loading={loading}
      onClick={go}
    >
      {loading ? (
        'Connecting…'
      ) : (
        <>
          <GoogleGlyph />
          <span>{label === 'sign-in' ? 'Sign in with Google' : 'Sign up with Google'}</span>
        </>
      )}
    </Button>
  );
}

// Compact mark inside a brand-blue circle, to match the mockup. Not the
// official multi-color Google "G" (Google's brand guidelines require using
// their approved asset for that — outside this Subtask's scope; a future
// branding pass can swap it for the official SVG). The circle + "G"
// approximation is visually consistent with the mockup and unambiguous.
function GoogleGlyph() {
  return (
    <span
      aria-hidden
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-white"
      style={{ backgroundColor: '#1a73e8' }}
    >
      <span className="font-sans text-sm font-semibold leading-none">G</span>
    </span>
  );
}

function humanizeOAuthError(raw: string | null): string {
  // Better-Auth surfaces a few documented codes (USER_CANCELED, etc.) but
  // most provider-side failures come through as opaque strings. Keep the
  // copy aligned with mockup 06 — short, actionable, no enumeration.
  if (!raw) return "Google sign-in didn't complete. Try again, or use email.";
  return "Google sign-in didn't complete. Try again, or use email.";
}
