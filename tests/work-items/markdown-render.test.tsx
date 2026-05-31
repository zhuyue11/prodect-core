// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderMarkdown } from '@/lib/markdown/render';

// Smoke test for the Markdown render stack (lib/markdown/render.tsx) — the
// pipeline behind work-item descriptionMd / explanationMd. Runs in happy-dom
// (opted in via the directive above; the rest of the suite stays on node).
//
// One fixture exercises every GFM feature the Story commits to, plus an
// inline <script> that MUST be stripped (the XSS guarantee). Assertions:
//   - the <script> tag never reaches the DOM
//   - headings / lists / ordered lists / task checkbox / table / link / image
//     render as the expected semantic HTML
//   - the fenced `tsx` code block carries rehype-highlight's hljs-* markup

const FIXTURE = `# Heading One

## Heading Two

Some **bold** and *italic* text.

- bullet alpha
- bullet beta

1. ordered first
2. ordered second

- [ ] unchecked task
- [x] checked task

| Feature | Status |
| ------- | ------ |
| tables  | yes    |

\`\`\`tsx
const greeting: string = 'hello';
console.log(greeting);
\`\`\`

[example link](https://example.com)

![the alt text](https://example.com/image.png)

<script>alert(1)</script>
`;

describe('renderMarkdown', () => {
  const { container } = render(renderMarkdown(FIXTURE));
  const html = container.innerHTML;

  it('strips inline <script> tags (XSS guard)', () => {
    expect(container.querySelector('script')).toBeNull();
    expect(html).not.toContain('<script');
    // The text node "alert(1)" may remain as inert text, but no executable
    // element wraps it.
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('renders headings as <h1>/<h2>', () => {
    expect(container.querySelector('h1')?.textContent).toBe('Heading One');
    expect(container.querySelector('h2')?.textContent).toBe('Heading Two');
  });

  it('renders bold and italic emphasis', () => {
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
  });

  it('renders an unordered list', () => {
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    const items = Array.from(ul!.querySelectorAll('li')).map((li) => li.textContent?.trim());
    expect(items).toContain('bullet alpha');
    expect(items).toContain('bullet beta');
  });

  it('renders an ordered list', () => {
    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
    expect(ol!.querySelectorAll('li').length).toBe(2);
  });

  it('renders GFM task-list checkboxes', () => {
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
    const checked = container.querySelectorAll('input[type="checkbox"]:checked');
    expect(checked.length).toBe(1);
  });

  it('renders a GFM table with header and body cells', () => {
    expect(container.querySelector('table')).not.toBeNull();
    const headers = Array.from(container.querySelectorAll('th')).map((th) => th.textContent);
    expect(headers).toEqual(['Feature', 'Status']);
    const cells = Array.from(container.querySelectorAll('td')).map((td) => td.textContent);
    expect(cells).toEqual(['tables', 'yes']);
  });

  it('renders a link with its href', () => {
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://example.com');
    expect(a?.textContent).toBe('example link');
  });

  it('renders an image with src and alt', () => {
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/image.png');
    expect(img?.getAttribute('alt')).toBe('the alt text');
  });

  it('syntax-highlights the fenced tsx code block (hljs-* markup)', () => {
    const code = container.querySelector('pre code');
    expect(code).not.toBeNull();
    // rehype-highlight adds the `hljs` class on the <code> and hljs-* spans
    // inside it. The order (sanitize THEN highlight) keeps these classes alive.
    expect(code!.className).toContain('hljs');
    expect(html).toContain('hljs-');
  });
});
