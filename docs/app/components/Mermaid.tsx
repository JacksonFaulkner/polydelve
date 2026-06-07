'use client';

import { use, useEffect, useId, useState } from 'react';
import { useTheme } from 'next-themes';

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const p = fn();
  cache.set(key, p);
  return p;
}

function MermaidContent({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, '');
  const { resolvedTheme } = useTheme();
  const { default: mermaid } = use(cachePromise('mermaid', () => import('mermaid')));

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    theme: resolvedTheme === 'dark' ? 'dark' : 'default',
  });

  const { svg, bindFunctions } = use(
    cachePromise(`${chart}-${resolvedTheme}`, () =>
      mermaid.render(`m${id}`, chart.replaceAll('\\n', '\n'))
    )
  );

  return (
    <div
      ref={el => { if (el) bindFunctions?.(el); }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function Mermaid({ chart }: { chart: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <MermaidContent chart={chart} />;
}
