import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEmailProvider, sendEmail } from '@/lib/email';

// These tests exercise the small switch in lib/email.ts. The integration of
// sendEmail with Better-Auth's password-reset flow lives in
// tests/password-reset.test.ts and hits a real Postgres.

describe('getEmailProvider', () => {
  const originalProvider = process.env['EMAIL_PROVIDER'];

  afterEach(() => {
    // Tests in this file mutate EMAIL_PROVIDER to exercise the switch.
    // Restore the original after each so neither the rest of the file nor
    // other test files inherit a poisoned env.
    if (originalProvider === undefined) {
      delete process.env['EMAIL_PROVIDER'];
    } else {
      process.env['EMAIL_PROVIDER'] = originalProvider;
    }
  });

  it('returns a callable provider when EMAIL_PROVIDER=console', () => {
    process.env['EMAIL_PROVIDER'] = 'console';
    const provider = getEmailProvider();
    expect(typeof provider).toBe('function');
  });

  it('defaults to the console provider when EMAIL_PROVIDER is unset', () => {
    delete process.env['EMAIL_PROVIDER'];
    const provider = getEmailProvider();
    expect(typeof provider).toBe('function');
  });

  it('throws a clear error for an unknown provider', () => {
    process.env['EMAIL_PROVIDER'] = 'sendgrid';
    expect(() => getEmailProvider()).toThrowError(/Unknown EMAIL_PROVIDER='sendgrid'/);
  });

  it('throws on send for a stubbed provider until wired', async () => {
    process.env['EMAIL_PROVIDER'] = 'resend';
    const provider = getEmailProvider();
    await expect(
      provider({ to: 'x@example.com', subject: 's', html: '<p>h</p>' }),
    ).rejects.toThrowError(/not yet implemented/);
  });
});

describe('consoleProvider (via the eagerly-resolved sendEmail singleton)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Stub console.log so the test capture is the only sink. Without this
    // the email body would leak into Vitest's reporter output.
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('writes a single [EMAIL] line to stdout with subject and body', async () => {
    await sendEmail({
      to: 'alice@example.com',
      subject: 'Hello',
      html: '<p>Body</p>',
      text: 'Body',
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const message = logSpy.mock.calls[0]![0] as string;
    expect(message).toContain('[EMAIL] To: alice@example.com');
    expect(message).toContain('Subject: Hello');
    expect(message).toContain('Body');
  });

  it('uses the html-stripped fallback when text is omitted', async () => {
    await sendEmail({
      to: 'bob@example.com',
      subject: 'Welcome',
      html: '<p>Click <a href="https://example.com/reset">here</a> to reset.</p>',
    });

    const message = logSpy.mock.calls[0]![0] as string;
    expect(message).toContain('https://example.com/reset');
    expect(message).not.toContain('<a href');
  });

  it('keeps reset links unredacted so dev/test flows can grep them', async () => {
    const url = 'http://localhost:3000/reset-password/abc123def456?callbackURL=';
    await sendEmail({
      to: 'carol@example.com',
      subject: 'Reset your password',
      text: `Reset link: ${url}`,
      html: `<a href="${url}">Reset</a>`,
    });

    const message = logSpy.mock.calls[0]![0] as string;
    expect(message).toContain(url);
  });
});
