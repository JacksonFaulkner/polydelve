'use client';

export default function DrawioEmbed({ file, height = 600 }: { file: string; height?: number }) {
  const raw = `https://raw.githubusercontent.com/jacksonfaulkner/polydelve/main/${file}`;
  const src = `https://viewer.diagrams.net/?url=${encodeURIComponent(raw)}&toolbar=0&nav=1&chrome=0`;
  return (
    <iframe
      src={src}
      width="100%"
      height={height}
      style={{ border: 'none', borderRadius: '8px' }}
      title="Architecture Diagram"
    />
  );
}
