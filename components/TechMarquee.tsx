import React from "react";

/* Each entry: { name, kind: "logo" | "word", glyph } */
const TECH_LOGOS = [
  // --- Code / runtime ---
  { name: "GitHub", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.18c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.8 10.8 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z"/>
    </svg>
  )},
  { name: "Google", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.35 11.1H12v2.94h5.39c-.23 1.4-1.66 4.11-5.39 4.11-3.24 0-5.88-2.69-5.88-6s2.64-6 5.88-6c1.85 0 3.08.79 3.79 1.47l2.59-2.5C16.7 3.55 14.6 2.5 12 2.5 6.76 2.5 2.5 6.76 2.5 12s4.26 9.5 9.5 9.5c5.48 0 9.11-3.85 9.11-9.27 0-.62-.07-1.1-.16-1.63Z"/>
    </svg>
  )},
  { name: "Microsoft", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 2h9.5v9.5H2zM12.5 2H22v9.5h-9.5zM2 12.5h9.5V22H2zM12.5 12.5H22V22h-9.5z"/>
    </svg>
  )},
  { name: "Meta", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5.6 4.4C3 4.4 1 7.5 1 11.5c0 4 1.9 7 4.5 7 1.7 0 3-.9 5.1-4.3.8-1.3 1.4-2.4 1.5-2.5l1.7-2.7c.7 1 2 3.1 2 3.1 2.2 3.6 3.4 4.6 5.5 4.6 2.6 0 4.5-3 4.5-7s-2-7-4.6-7c-1.5 0-2.7.7-4.4 3-.5.7-1.1 1.6-1.9 3l-1 1.6c-2.6-3.9-4.5-7.6-8.3-7.6Zm.5 2.6c2.6 0 4 3 6 5.9C10.2 15.7 9 16.3 7 16.3c-2 0-3.4-2-3.4-4.6 0-2.5 1.4-4.7 2.5-4.7Zm13.4 0c2.1 0 3.5 2.1 3.5 4.6 0 2.6-1.4 4.6-3.4 4.6-1.9 0-2.7-1.2-4.7-4.4l-.7-1.2c1.9-2.7 3.2-3.7 5.3-3.7Z" opacity=".95"/>
    </svg>
  )},
  { name: "React", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.9" aria-hidden="true">
      <circle cx="12" cy="12" r="2" fill="currentColor"/>
      <ellipse cx="12" cy="12" rx="11" ry="4.2"/>
      <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(60 12 12)"/>
      <ellipse cx="12" cy="12" rx="11" ry="4.2" transform="rotate(120 12 12)"/>
    </svg>
  )},
  { name: "Next.js", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7.5 6.5h1.8v8.7H7.5zM9.6 6.5h1.6l5.5 7.6v3.3l-7.1-9.6Z"/>
      <path d="M14.7 6.5h1.7v7.6h-1.7z"/>
    </svg>
  )},
  { name: "Node.js", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1 1.5 7v10L12 23l10.5-6V7L12 1Zm0 2.3 8.5 4.85v7.7L12 20.7 3.5 15.85V8.15L12 3.3Zm-.6 5.7c-1.7 0-2.8.7-2.8 2 0 1.4 1 1.7 2.6 1.9 1.4.2 1.7.4 1.7.9 0 .5-.5.8-1.5.8-1.2 0-1.6-.4-1.7-1.1H8.3c0 1.4 1.1 2.2 3 2.2 2 0 3.1-.8 3.1-2.2 0-1.5-1-1.9-2.7-2.1-1.4-.2-1.6-.4-1.6-.8 0-.4.3-.7 1.3-.7 1 0 1.4.3 1.5 1h1.4c-.1-1.3-1-2-2.9-2Z"/>
    </svg>
  )},
  { name: "TypeScript", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="2"/>
      <path d="M13.5 11.5v1.6h2.5v6.4h1.9v-6.4H20.4v-1.6h-6.9ZM6.5 13.4c0-1.6 1.3-2.4 3-2.4 1.4 0 2.4.6 2.9 1.5l-1.4.9c-.3-.5-.7-.9-1.5-.9-.7 0-1.1.4-1.1.8 0 .5.3.7 1.4 1.1 2 .7 2.6 1.4 2.6 2.6 0 1.7-1.3 2.6-3.2 2.6-1.7 0-2.9-.8-3.4-1.9l1.4-.9c.4.7 1 1.2 2 1.2.8 0 1.3-.4 1.3-.9 0-.6-.5-.8-1.5-1.2-1.6-.6-2.5-1.2-2.5-2.5Z" fill="var(--upz-off-white)"/>
    </svg>
  )},
  { name: "JavaScript", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="2"/>
      <path d="M8 9.5h1.9v7.1c0 1.6-.8 2.4-2.3 2.4-1.2 0-1.9-.5-2.3-1.3l1.5-.9c.2.4.5.7.9.7.5 0 .7-.3.7-.9V9.5ZM12.7 16.9l1.6-.9c.3.6.7 1 1.6 1 .7 0 1.1-.3 1.1-.8 0-.6-.5-.7-1.4-1.1l-.5-.2c-1.5-.6-2.4-1.3-2.4-2.9 0-1.5 1.1-2.6 2.9-2.6 1.3 0 2.2.4 2.9 1.6l-1.6.9c-.4-.6-.7-.9-1.3-.9-.6 0-1 .4-1 .9 0 .6.4.8 1.2 1.2l.5.2c1.7.7 2.7 1.4 2.7 3 0 1.8-1.4 2.7-3.2 2.7-1.8 0-3-.8-3.6-1.9Z" fill="var(--upz-carbon)"/>
    </svg>
  )},
  { name: "HTML5", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.5 1.5h19l-1.7 19.4L12 23l-7.8-2.1L2.5 1.5Zm3.8 3.1L7 12.7h7.5L14.2 16 12 16.6 9.8 16l-.1-1.7H7.7l.2 3.4 4.1 1.2 4.2-1.2.6-6.4H8.9l-.2-2h8.4l.2-2H6.3Z"/>
    </svg>
  )},
  { name: "CSS3", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.5 1.5h19l-1.7 19.4L12 23l-7.8-2.1L2.5 1.5Zm14.1 5.6H7.9l.2 2.4h8.2l-.6 6.4-3.7 1-3.7-1-.2-2.6h1.8l.1 1.3 2 .6 2-.6.2-2.3H7.6L7 7.1h10l-.4 0Z"/>
    </svg>
  )},
  { name: "Tailwind", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 6c-2.5 0-4 1.2-4.5 3.7.7-1 1.6-1.3 2.6-1.1.6.1 1 .5 1.5 1 .8.8 1.7 1.7 3.7 1.7 2.5 0 4-1.3 4.5-3.8-.7 1-1.6 1.3-2.6 1.1-.6-.1-1-.5-1.5-1-.8-.8-1.7-1.6-3.7-1.6ZM7.5 12.3c-2.5 0-4 1.3-4.5 3.8.7-1 1.6-1.3 2.6-1.1.6.1 1 .5 1.5 1 .8.8 1.7 1.7 3.7 1.7 2.5 0 4-1.3 4.5-3.8-.7 1-1.6 1.3-2.6 1.1-.6-.1-1-.5-1.5-1-.8-.8-1.7-1.7-3.7-1.7Z"/>
    </svg>
  )},
  { name: "Flutter", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14.3 2 4 12.3l3.2 3.2L20.7 2h-6.4ZM14.3 12.5 8.6 18.3 12 21.7l5.6-5.6Z"/>
      <path d="m12 21.7-3.4-3.4L11 16l1 1.1 3.2-3.2 3.4 3.4Z" opacity=".7"/>
    </svg>
  )},
  { name: "Figma", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 2h3v6.5H8.5A3.25 3.25 0 0 1 5.25 5.25 3.25 3.25 0 0 1 9 2Z"/>
      <path d="M12 2h3a3.25 3.25 0 0 1 3.25 3.25A3.25 3.25 0 0 1 15 8.5h-3V2Z"/>
      <path d="M12 8.5h3a3.25 3.25 0 0 1 3.25 3.25A3.25 3.25 0 0 1 15 15h-3V8.5Z"/>
      <path d="M8.5 8.5H12V15H8.5a3.25 3.25 0 0 1-3.25-3.25A3.25 3.25 0 0 1 8.5 8.5Z"/>
      <path d="M5.25 18.25A3.25 3.25 0 0 1 8.5 15H12v3.25A3.25 3.25 0 0 1 8.75 21.5 3.25 3.25 0 0 1 5.5 18.25Z"/>
    </svg>
  )},
  { name: "Adobe", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 3h8v18L2 3Zm12 0h8v18L14 3Zm-2 8 4 10h-2.5l-1-2.6h-2.4Z"/>
    </svg>
  )},
  { name: "Premiere", kind: "word", glyph: "Pr" },
  { name: "After Effects", kind: "word", glyph: "Ae" },
  { name: "Photoshop", kind: "word", glyph: "Ps" },
  { name: "Illustrator", kind: "word", glyph: "Ai" },
  { name: "Shopify", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.5 5.4c-.1-.1-.3-.1-.4-.1l-.7.2c-.4-1.2-1.1-2.4-2.5-2.4h-.1c-.4-.5-.9-.7-1.4-.7-3.7 0-5.5 4.6-6.1 7l-2.6.8c-.8.2-.8.3-.9 1L1 18.4 13 21l5.5-1.2-3-14.4ZM10 4.8c.5 0 .8.2 1.1.5h-.2c-2.4 0-3.6 3-4 4.7l-2 .6C5.5 8.7 6.9 4.8 10 4.8Zm-1 3c1-3.1 2-3.4 2.7-3.5.4.6.7 1.5.7 2.5l-2.5.8c-.4.1-.6.2-.9.2Zm2.6-3.1c.5.4 1 1.1 1.3 2l-1.5.5c0-.9-.2-1.7-.5-2.4Z"/>
    </svg>
  )},
  { name: "WordPress", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2Zm0 1.4c4.7 0 8.6 3.9 8.6 8.6 0 3.2-1.8 6.1-4.5 7.5l3.7-10.6c.5-1.2.6-2.1.6-2.8 0-.3 0-.5-.1-.7 1.4 1.6 2.3 3.6 2.3 5.8 0 0-2.5-5.8-8.6-7.8Zm-.7 5.4 2.6 7.2-3 8.7-4.6-13.5c.8 0 1.5-.1 1.5-.1.7-.1.6-1.1-.1-1.1 0 0-2.2.2-3.5.2-.3 0-.5 0-.7-.1C4.1 5.7 7.8 3.4 12 3.4c2.8 0 5.4 1 7.4 2.8h-.4c-.8 0-1.4.7-1.4 1.5 0 .7.4 1.3.9 2 .3.6.7 1.3.7 2.4 0 .8-.3 1.7-.7 3l-.9 3-3.4-10.1c.5-.1 1.1-.1 1.1-.1.7-.1.6-1.2-.1-1.1 0 0-2.2.2-3.5.2-.3 0-.5 0-.7 0v-.1Z"/>
    </svg>
  )},
  { name: "Webflow", kind: "logo", glyph: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 5 16 19h-2.6l-2.7-7.7L7.8 19H5.2L1 5h2.7l2.8 9.5L9.4 5H12l2.9 9.5L18.4 5H22Z"/>
    </svg>
  )},
];

function TechLogo({ item }: { item: any }) {
  if (item.kind === "word") {
    return (
      <span className="tech-logo tech-logo-word" title={item.name}>
        <span className="tech-logo-word-bg">{item.glyph}</span>
      </span>
    );
  }
  return (
    <span className="tech-logo" title={item.name}>
      {item.glyph}
    </span>
  );
}

export function TechMarquee() {
  const loop = [...TECH_LOGOS, ...TECH_LOGOS];
  return (
    <section className="tech-marquee" data-screen-label="Tech Marquee" aria-label="Stack tecnológico">
      <div className="tech-marquee-track">
        {loop.map((item, i) => (
          <React.Fragment key={i}>
            <TechLogo item={item} />
            <span className="tech-marquee-sep">/</span>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}
