import Link from 'next/link';
import { type ReactNode } from 'react';

/**
 * Shared frame for the auth pages (sign-in, sign-up, reset-password,
 * reset-password/[token]). Matches the Clay-style design in the
 * Story-1.1 mockups (design/auth/01-12): no card chrome, wordmark
 * top-left, content column centered horizontally and left-aligned
 * within itself.
 *
 * The column itself constrains its inner width (~28rem on desktop,
 * full-width with horizontal padding on mobile) so individual pages
 * don't need to repeat the layout math.
 *
 * Wordmark is plain typography for v1 — a brand mark replaces it once
 * one exists (see PRODECT.md "Story 1.1 / Design"). The "P" tile uses
 * the primary token so the brand color stays in one place.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full overflow-x-clip bg-background">
      <header className="px-6 pt-8 sm:px-10">
        <Link
          href="/"
          aria-label="Prodect home"
          className="inline-flex items-center gap-2 rounded-(--radius-sm) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring-color) focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span
            aria-hidden
            className="inline-flex h-9 w-9 items-center justify-center rounded-(--radius-md) bg-primary font-serif text-lg font-semibold text-primary-foreground"
          >
            P
          </span>
          <span className="font-serif text-xl font-semibold text-foreground">Prodect</span>
        </Link>
      </header>
      <main className="flex justify-center px-6 pb-24 pt-12 sm:px-10 sm:pt-24">
        {/*
          Width pinned to a literal value rather than `max-w-md`: the
          design system's @theme block defines a custom `--spacing-md`
          (= 16px) which Tailwind v4 resolves into the default
          `max-w-md` utility — leaving the column 16px wide. Pinning
          the auth-column width here keeps the design-system token
          set un-touched and the layout predictable.
        */}
        <div className="w-full max-w-[28rem]">{children}</div>
      </main>
    </div>
  );
}
