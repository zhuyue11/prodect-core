// Email-sending abstraction.
//
// Every caller in prodect-core uses `sendEmail(...)` from this module. No
// caller imports a vendor SDK directly. That makes "which mailer to run in
// production" a per-project planner decision (Layer 2 — pre-plan work for
// each Prodect-planned project), not a starter-baked assumption (Layer 1).
//
// v1 of prodect-core ships ONLY the 'console' provider, which prints
// emails to stdout. Real providers (Resend, Postmark, …) are stubs that
// throw a loud not-yet-implemented error if selected — surfacing the
// missing wiring at startup rather than silently falling back to console.
//
// The provider is resolved eagerly at module-import time (see the
// `sendEmail` export at the bottom). An unknown EMAIL_PROVIDER value
// therefore crashes the app at boot with a clear message — not on the
// first email two days into a deploy.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export type SendEmail = (msg: EmailMessage) => Promise<void>;

// Strips HTML tags from a body for the plain-text fallback. Intentionally
// dumb — the console provider prints whichever body the caller passed; this
// only kicks in when a caller skipped `text`. Real providers should be given
// both an html and a text body by the caller, so this fallback is mostly a
// dev-console nicety.
function htmlToText(html: string): string {
  return (
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      // Surface anchor hrefs inline ("text (url)") so reset links remain
      // grep-able when a caller passes only html. Critical for the
      // console-provider's "tests can read the link off stdout" promise.
      .replace(
        /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_, href, inner) =>
          `${String(inner)
            .replace(/<[^>]+>/g, '')
            .trim()} (${href})`,
      )
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

const consoleProvider: SendEmail = async (msg) => {
  const body = msg.text ?? htmlToText(msg.html);
  // The reset link MUST appear unredacted so dev/test flows can grep it.
  // (Better-Auth's password-reset flow puts the token in the URL body of
  // the email; tests in tests/password-reset.test.ts capture this stdout.)
  // eslint-disable-next-line no-console -- console is the entire point of this provider
  console.log(`[EMAIL] To: ${msg.to} Subject: ${msg.subject}\n${body}`);
};

function unimplementedProvider(name: string): SendEmail {
  return async () => {
    throw new Error(
      `Email provider '${name}' is not yet implemented in prodect-core. ` +
        `Production providers are planner work for each Prodect-planned project's ` +
        `pre-plan phase — see lib/email.ts and the Story 1.1 decisions log. ` +
        `Set EMAIL_PROVIDER=console for local dev.`,
    );
  };
}

export function getEmailProvider(): SendEmail {
  const provider = process.env['EMAIL_PROVIDER'] ?? 'console';
  switch (provider) {
    case 'console':
      return consoleProvider;
    case 'resend':
      return unimplementedProvider('resend');
    case 'postmark':
      return unimplementedProvider('postmark');
    default:
      throw new Error(
        `Unknown EMAIL_PROVIDER='${provider}'. ` +
          `Valid values: 'console' (default), 'resend', 'postmark'. ` +
          `See lib/email.ts for the abstraction.`,
      );
  }
}

export const sendEmail: SendEmail = getEmailProvider();
