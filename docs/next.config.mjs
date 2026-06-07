import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX({ outDir: '_source' });

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  watchOptions: {
    ignored: ['**/_source/**', '**/*.drawio', '**/node_modules/**'],
  },
};

export default withMDX(config);
