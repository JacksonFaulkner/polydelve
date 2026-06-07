'use client';

import { useEffect, useRef, useState } from 'react';

const SCRIPT_ID = 'drawio-viewer-script';

function loadViewerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://www.draw.io/js/viewer.min.js';
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default function DrawioEmbed({ file, height = 600, wide = false }: { file: string; height?: number; wide?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const [, xml] = await Promise.all([
          loadViewerScript(),
          fetch(`/${file}`).then(r => {
            if (!r.ok) throw new Error(`${r.status} loading /${file}`);
            return r.text();
          }),
        ]);

        if (cancelled || !containerRef.current) return;

        const config = JSON.stringify({ xml, editable: false, nav: false, toolbar: null, resize: true });
        containerRef.current.innerHTML = `<div class="mxgraph" style="width:100%;height:100%;background:#fff;" data-mxgraph="${escapeHtml(config)}"></div>`;

        // @ts-expect-error mxgraph global
        window.GraphViewer.processElements();
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }

    render();
    return () => { cancelled = true; };
  }, [file]);

  if (error) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'red', fontSize: 14 }}>
        {error}
      </div>
    );
  }

  return (
    <div
      style={
        wide
          ? { marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)', width: '100vw', height }
          : { height }
      }
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#fff', borderRadius: wide ? 0 : 8 }} />
    </div>
  );
}
