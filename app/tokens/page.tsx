'use client';

import { useTheme } from '@/lib/contexts/theme-context';
import type { DisplayStyle, ThemePattern } from '@/lib/theme/types';

/**
 * /tokens — the design system reference route.
 *
 * Renders every token category (colors, typography, radius, shadow,
 * spacing) as visual swatches/specimens. Interactive theme + display-style
 * toggles at the top so reviewers can flip and verify the system responds
 * correctly via CSS variables only — no React re-render on toggle.
 *
 * This route is the "living spec" of the design system. Future Subtasks
 * (1.0.5.2 primitives) will extend it with component examples.
 */

const COLOR_TOKENS = [
  // Brand & primary
  { name: 'primary', label: 'Primary (CTA)' },
  { name: 'primary-foreground', label: 'On Primary' },
  // Surfaces
  { name: 'background', label: 'Background' },
  { name: 'foreground', label: 'Foreground' },
  { name: 'surface', label: 'Surface' },
  { name: 'surface-soft', label: 'Surface Soft' },
  // Text scale
  { name: 'ink', label: 'Ink' },
  { name: 'charcoal', label: 'Charcoal' },
  { name: 'slate', label: 'Slate' },
  { name: 'steel', label: 'Steel' },
  { name: 'stone', label: 'Stone' },
  { name: 'muted-foreground', label: 'Muted Foreground' },
  // Hairlines
  { name: 'hairline', label: 'Hairline' },
  { name: 'hairline-strong', label: 'Hairline Strong' },
  { name: 'border', label: 'Border' },
  // Accents
  { name: 'accent', label: 'Accent (Pink)' },
  { name: 'accent-orange', label: 'Accent Orange' },
  { name: 'accent-teal', label: 'Accent Teal' },
  { name: 'accent-green', label: 'Accent Green' },
  // Tints
  { name: 'tint-peach', label: 'Tint Peach' },
  { name: 'tint-rose', label: 'Tint Rose' },
  { name: 'tint-mint', label: 'Tint Mint' },
  { name: 'tint-lavender', label: 'Tint Lavender' },
  { name: 'tint-sky', label: 'Tint Sky' },
  { name: 'tint-yellow', label: 'Tint Yellow' },
  // Semantic
  { name: 'success', label: 'Success' },
  { name: 'warning', label: 'Warning' },
  { name: 'destructive', label: 'Destructive' },
  { name: 'info', label: 'Info' },
  { name: 'link', label: 'Link' },
] as const;

const TYPE_SCALE = [
  { token: '--font-size-xs', label: 'xs / 12px', value: '0.75rem' },
  { token: '--font-size-sm', label: 'sm / 14px', value: '0.875rem' },
  { token: '--font-size-base', label: 'base / 16px', value: '1rem' },
  { token: '--font-size-lg', label: 'lg / 20px', value: '1.25rem' },
  { token: '--font-size-xl', label: 'xl / 24px', value: '1.5rem' },
  { token: '--font-size-2xl', label: '2xl / 32px', value: '2rem' },
  { token: '--font-size-3xl', label: '3xl / 48px', value: '3rem' },
  { token: '--font-size-display', label: 'display / 80px', value: '5rem' },
] as const;

const RADIUS_TOKENS = [
  { name: '--radius-xs', label: 'xs' },
  { name: '--radius-sm', label: 'sm' },
  { name: '--radius-md', label: 'md' },
  { name: '--radius-lg', label: 'lg' },
  { name: '--radius-xl', label: 'xl' },
  { name: '--radius-pill', label: 'pill' },
  { name: '--radius-btn', label: 'btn (semantic)' },
  { name: '--radius-card', label: 'card (semantic)' },
] as const;

const SHADOW_TOKENS = [
  { name: '--shadow-subtle', label: 'Subtle' },
  { name: '--shadow-card', label: 'Card' },
  { name: '--shadow-elevated', label: 'Elevated' },
  { name: '--shadow-modal', label: 'Modal' },
  { name: '--shadow-hero-mockup', label: 'Hero Mockup' },
] as const;

const SPACING_TOKENS = [
  { name: '--spacing-xxs', label: 'xxs / 4px' },
  { name: '--spacing-xs', label: 'xs / 8px' },
  { name: '--spacing-sm', label: 'sm / 12px' },
  { name: '--spacing-md', label: 'md / 16px' },
  { name: '--spacing-lg', label: 'lg / 20px' },
  { name: '--spacing-xl', label: 'xl / 24px' },
  { name: '--spacing-2xl', label: '2xl / 32px' },
  { name: '--spacing-3xl', label: '3xl / 40px' },
] as const;

const PATTERN_OPTIONS: { value: ThemePattern; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const DISPLAY_STYLE_OPTIONS: { value: DisplayStyle; label: string }[] = [
  { value: 'default', label: 'Default (Notion-sober)' },
  { value: 'soft', label: 'Soft (Figma-pill)' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        marginBottom: 'var(--spacing-section)',
        paddingBottom: 'var(--spacing-xl)',
        borderBottom: '1px solid var(--el-border)',
      }}
    >
      <h2
        className="font-serif text-2xl font-semibold"
        style={{ marginBottom: 'var(--spacing-lg)' }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Swatch({ name, label }: { name: string; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-xs)',
        padding: 'var(--spacing-md)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--el-border)',
      }}
    >
      <div
        aria-label={label}
        style={{
          width: '100%',
          height: '64px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: `var(--color-${name})`,
          border: '1px solid var(--el-border)',
        }}
      />
      <div className="font-mono text-xs">
        <div className="font-medium">{label}</div>
        <div style={{ color: 'var(--el-page-text-muted)' }}>--color-{name}</div>
      </div>
    </div>
  );
}

function Button({
  variant,
  size = 'md',
  children,
}: {
  variant: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}) {
  const height =
    size === 'sm'
      ? 'var(--height-btn-sm)'
      : size === 'lg'
        ? 'var(--height-btn-lg)'
        : 'var(--height-btn-md)';
  const isPrimary = variant === 'primary';
  return (
    <button
      type="button"
      style={{
        height,
        paddingInline: 'var(--spacing-btn-x)',
        borderRadius: 'var(--radius-btn)',
        backgroundColor: isPrimary ? 'var(--color-primary)' : 'transparent',
        color: isPrimary ? 'var(--color-primary-foreground)' : 'var(--el-page-text)',
        border: isPrimary ? 'none' : `1px solid var(--color-hairline-strong)`,
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'transform var(--transition-duration) ease',
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = `scale(var(--active-scale))`;
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = `scale(1)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = `scale(1)`;
      }}
    >
      {children}
    </button>
  );
}

function ThemeControls() {
  const { pattern, displayStyle, setPattern, setDisplayStyle } = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--spacing-xl)',
        padding: 'var(--spacing-lg)',
        marginBottom: 'var(--spacing-section)',
        borderRadius: 'var(--radius-card)',
        backgroundColor: 'var(--el-surface)',
        border: '1px solid var(--el-border)',
      }}
    >
      <div>
        <div
          className="font-mono text-xs"
          style={{
            color: 'var(--el-page-text-muted)',
            marginBottom: 'var(--spacing-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Theme pattern
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
          {PATTERN_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPattern(opt.value)}
              aria-pressed={pattern === opt.value}
              style={{
                paddingInline: 'var(--spacing-md)',
                paddingBlock: 'var(--spacing-xs)',
                borderRadius: 'var(--radius-pill)',
                border: `1px solid ${pattern === opt.value ? 'var(--color-primary)' : 'var(--el-border)'}`,
                backgroundColor: pattern === opt.value ? 'var(--color-primary)' : 'transparent',
                color:
                  pattern === opt.value ? 'var(--color-primary-foreground)' : 'var(--el-page-text)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div
          className="font-mono text-xs"
          style={{
            color: 'var(--el-page-text-muted)',
            marginBottom: 'var(--spacing-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Display style
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
          {DISPLAY_STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDisplayStyle(opt.value)}
              aria-pressed={displayStyle === opt.value}
              style={{
                paddingInline: 'var(--spacing-md)',
                paddingBlock: 'var(--spacing-xs)',
                borderRadius: 'var(--radius-pill)',
                border: `1px solid ${displayStyle === opt.value ? 'var(--color-primary)' : 'var(--el-border)'}`,
                backgroundColor:
                  displayStyle === opt.value ? 'var(--color-primary)' : 'transparent',
                color:
                  displayStyle === opt.value
                    ? 'var(--color-primary-foreground)'
                    : 'var(--el-page-text)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TokensPage() {
  return (
    <main
      style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: 'var(--spacing-3xl) var(--spacing-xl)',
      }}
    >
      <header style={{ marginBottom: 'var(--spacing-section)' }}>
        <p
          className="font-mono text-xs"
          style={{
            color: 'var(--el-page-text-muted)',
            marginBottom: 'var(--spacing-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Prodect design system
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">Tokens</h1>
        <p
          className="text-base"
          style={{
            color: 'var(--el-page-text-muted)',
            marginTop: 'var(--spacing-sm)',
            maxWidth: '60ch',
            lineHeight: 1.5,
          }}
        >
          Live reference for every design token. Toggle the theme + display-style below and watch
          the system respond via CSS variables only — no React re-renders on toggle.
        </p>
      </header>

      <ThemeControls />

      <Section title="Typography">
        <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
          <p
            className="font-mono text-xs"
            style={{
              color: 'var(--el-page-text-muted)',
              marginBottom: 'var(--spacing-md)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Font families
          </p>
          <div style={{ display: 'grid', gap: 'var(--spacing-md)' }}>
            <div>
              <div className="font-mono text-xs" style={{ color: 'var(--el-page-text-muted)' }}>
                font-sans · Inter
              </div>
              <div className="font-sans text-xl">The quick brown fox jumps over the lazy dog.</div>
            </div>
            <div>
              <div className="font-mono text-xs" style={{ color: 'var(--el-page-text-muted)' }}>
                font-serif · Source Serif 4
              </div>
              <div className="font-serif text-xl">The quick brown fox jumps over the lazy dog.</div>
            </div>
            <div>
              <div className="font-mono text-xs" style={{ color: 'var(--el-page-text-muted)' }}>
                font-mono · JetBrains Mono
              </div>
              <div className="font-mono text-xl">The quick brown fox jumps over the lazy dog.</div>
            </div>
          </div>
        </div>
        <div>
          <p
            className="font-mono text-xs"
            style={{
              color: 'var(--el-page-text-muted)',
              marginBottom: 'var(--spacing-md)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Type scale
          </p>
          <div style={{ display: 'grid', gap: 'var(--spacing-md)' }}>
            {TYPE_SCALE.map((t) => (
              <div
                key={t.token}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr',
                  alignItems: 'baseline',
                  gap: 'var(--spacing-md)',
                }}
              >
                <div className="font-mono text-xs" style={{ color: 'var(--el-page-text-muted)' }}>
                  {t.label}
                </div>
                <div style={{ fontSize: `var(${t.token})`, lineHeight: 1.2 }}>Prodect</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Color">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 'var(--spacing-md)',
          }}
        >
          {COLOR_TOKENS.map((c) => (
            <Swatch key={c.name} name={c.name} label={c.label} />
          ))}
        </div>
      </Section>

      <Section title="Radius">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 'var(--spacing-md)',
          }}
        >
          {RADIUS_TOKENS.map((r) => (
            <div
              key={r.name}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-xs)',
                padding: 'var(--spacing-md)',
                border: '1px solid var(--el-border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '64px',
                  borderRadius: `var(${r.name})`,
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--el-border-strong)',
                }}
              />
              <div className="font-mono text-xs">
                <div className="font-medium">{r.label}</div>
                <div style={{ color: 'var(--el-page-text-muted)' }}>{r.name}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Shadow">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 'var(--spacing-xl)',
          }}
        >
          {SHADOW_TOKENS.map((s) => (
            <div key={s.name} style={{ padding: 'var(--spacing-md)' }}>
              <div
                style={{
                  width: '100%',
                  height: '80px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface)',
                  boxShadow: `var(${s.name})`,
                  marginBottom: 'var(--spacing-sm)',
                }}
              />
              <div className="font-mono text-xs">
                <div className="font-medium">{s.label}</div>
                <div style={{ color: 'var(--el-page-text-muted)' }}>{s.name}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Spacing">
        <div style={{ display: 'grid', gap: 'var(--spacing-xs)' }}>
          {SPACING_TOKENS.map((s) => (
            <div
              key={s.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '160px 1fr',
                alignItems: 'center',
                gap: 'var(--spacing-md)',
              }}
            >
              <div className="font-mono text-xs">{s.label}</div>
              <div
                style={{
                  height: '16px',
                  width: `var(${s.name})`,
                  backgroundColor: 'var(--color-primary)',
                  borderRadius: 'var(--radius-xs)',
                }}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons (responds to display style)">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--spacing-md)',
            alignItems: 'center',
          }}
        >
          <Button variant="primary" size="sm">
            Small primary
          </Button>
          <Button variant="primary" size="md">
            Get Prodect free
          </Button>
          <Button variant="primary" size="lg">
            Large primary
          </Button>
          <Button variant="secondary" size="md">
            Request a demo
          </Button>
        </div>
        <p
          className="text-sm"
          style={{ color: 'var(--el-page-text-muted)', marginTop: 'var(--spacing-md)' }}
        >
          Toggle <code className="font-mono text-xs">display-style</code> above to see Notion-sober
          rectangles flip to Figma-pill shapes. CSS only — no React re-render.
        </p>
      </Section>
    </main>
  );
}
