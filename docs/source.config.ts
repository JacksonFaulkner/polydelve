import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { remarkModelLinks } from './plugins/remark-model-links.mjs';

export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid, remarkModelLinks],
    // External images are size-probed at build time; an unreachable host should
    // only drop the size hint, not fail the whole build.
    remarkImageOptions: { onError: 'ignore' },
  },
});
