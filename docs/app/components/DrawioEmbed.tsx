'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function DrawioEmbed({ file, height = 600, wide = false }: { file: string; height?: number; wide?: boolean }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dark = mounted && resolvedTheme === 'dark' ? '&dark=1' : '';
  const raw = `https://raw.githubusercontent.com/JacksonFaulkner/polydelve/main/${file}`;
  const src = `https://viewer.diagrams.net/?url=${encodeURIComponent(raw)}&toolbar=0&nav=1&chrome=0${dark}`;

  if (!mounted) return <div style={{ height }} />;

  return (
    <div style={wide ? { marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)', width: '100vw' } : undefined}>
      <iframe
        key={resolvedTheme}
        src={src}
        width="100%"
        height={height}
        style={{ border: 'none', borderRadius: wide ? 0 : '8px', display: 'block' }}
        title="Architecture Diagram"
      />
    </div>
  );
}
