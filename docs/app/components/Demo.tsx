'use client';

import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from 'fumadocs-ui/components/ui/popover';

// Short demo clips are recorded + rendered by docs/animation (npm run demos)
// and uploaded to the assets bucket under demos/<name>.mp4 (+ .png poster).
const BASE = 'https://assets.polydelve.com/demos';

function Clip({ name }: { name: string }) {
  return (
    <video
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      poster={`${BASE}/${name}.png`}
      style={{ width: '100%', display: 'block' }}
    >
      <source src={`${BASE}/${name}.mp4`} type="video/mp4" />
    </video>
  );
}

// Inline looping demo.
export function Demo({ name, caption }: { name: string; caption?: string }) {
  return (
    <figure style={{ margin: '1.25rem 0' }}>
      <div
        style={{
          overflow: 'hidden',
          borderRadius: 12,
          border: '1px solid var(--color-fd-border)',
        }}
      >
        <Clip name={name} />
      </div>
      {caption && (
        <figcaption
          style={{ marginTop: 8, fontSize: 13, textAlign: 'center', color: 'var(--color-fd-muted-foreground)' }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// Dotted-underline text that opens a small demo on hover (desktop) or tap.
export function DemoTip({ name, children }: { name: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          style={{ textDecoration: 'underline dotted', textUnderlineOffset: 3, cursor: 'help' }}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,460px)] overflow-hidden p-0">
        <Clip name={name} />
      </PopoverContent>
    </Popover>
  );
}
