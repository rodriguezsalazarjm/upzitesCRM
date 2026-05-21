import type { ReactNode } from "react";

export type SocialType = "instagram" | "facebook" | "tiktok" | "x" | "threads" | "linkedin" | "behance";
export type SocialLink = { type: SocialType; url: string };

const LABELS: Record<SocialType, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X (Twitter)",
  threads: "Threads",
  linkedin: "LinkedIn",
  behance: "Behance",
};

const ICONS: Record<SocialType, ReactNode> = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  threads: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.781 3.631 2.695 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291.985-.057 1.903 0 2.754.169-.116-.694-.349-1.246-.697-1.646-.477-.55-1.214-.83-2.192-.834h-.027c-.785 0-1.85.216-2.527 1.226l-1.681-1.131C9.305 6.327 10.84 5.591 12.71 5.591h.039c3.123.02 4.984 1.94 5.169 5.291.106.045.211.092.314.141 1.471.691 2.547 1.739 3.11 3.031.786 1.804.857 4.745-1.534 7.137-1.829 1.829-4.045 2.657-7.131 2.682z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  behance: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 7h-7V5h7v2zm1.726 10c-.442 1.297-2.029 3-5.101 3-3.074 0-5.564-1.729-5.564-5.675 0-3.91 2.325-5.92 5.466-5.92 3.082 0 4.964 1.782 5.375 4.426.078.506.109 1.188.095 2.14h-7.027c.13 3.211 3.483 3.312 4.588 2.029h2.7zm-7.207-4h4.396c-.157-1.215-.949-1.7-2.196-1.7-1.343 0-2.085.624-2.2 1.7zm-5.221.652c.749.331 1.293 1.014 1.293 2.27 0 2.084-1.564 3.078-3.451 3.078H0V5h4.971c1.804 0 3.367.504 3.367 2.665 0 1.07-.485 1.683-1.34 2.106 1.187.319 1.5 1.378 1.5 1.881zM2.595 9.557h2.083c.785 0 1.355-.344 1.355-1.117 0-.83-.633-1.073-1.36-1.073H2.595v2.19zm2.196 5.99c.815 0 1.516-.275 1.516-1.226 0-.953-.563-1.366-1.484-1.366h-2.23v2.592h2.198z" />
    </svg>
  ),
};

export const UPZITES_SOCIALS: SocialLink[] = [
  { type: "instagram", url: "https://www.instagram.com/upzites?igsh=OXRpZDNxYm53aTI2" },
  { type: "facebook", url: "https://www.facebook.com/share/1acUMQkSkZ/" },
];

export const JOSE_SOCIALS: SocialLink[] = [
  { type: "instagram", url: "https://www.instagram.com/josemarodriz?igsh=MW5pZXB3NHQyYzU2cQ==" },
  { type: "tiktok", url: "https://www.tiktok.com/@josemarodriz?_r=1&_t=ZS-96YAA5fpwoi" },
  { type: "x", url: "https://x.com/Zalazarjmr" },
  { type: "threads", url: "https://www.threads.com/@joserodrizg" },
  { type: "linkedin", url: "https://www.linkedin.com/in/jose-rodr%C3%ADguez-400547138/" },
  { type: "behance", url: "https://www.behance.net/josemarodrigu44" },
];

export const JILLY_SOCIALS: SocialLink[] = [
  { type: "linkedin", url: "https://www.linkedin.com/in/jilly-moreno-ba7485a5/" },
  { type: "instagram", url: "https://www.instagram.com/jillymoreno92?igsh=NTJqdzJ5enllNHJs" },
];

export function SocialLinks({ links, className }: { links: SocialLink[]; className?: string }) {
  return (
    <div className={`socials${className ? " " + className : ""}`}>
      {links.map((l) => (
        <a
          key={l.type + l.url}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="social-icon"
          aria-label={LABELS[l.type]}
          title={LABELS[l.type]}
        >
          {ICONS[l.type]}
        </a>
      ))}
    </div>
  );
}
