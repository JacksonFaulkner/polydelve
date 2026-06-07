import { findAndReplace } from 'mdast-util-find-and-replace';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MODELS_PAGE = '/docs/data/models';

export function remarkModelLinks() {
  return (tree) => {
    const manifestPath = join(process.cwd(), 'model-manifest.json');
    if (!existsSync(manifestPath)) return;

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const names = manifest.map((m) => m.name).filter(Boolean);
    if (names.length === 0) return;

    // longest-first so "ContractDetail" matches before "Contract"
    names.sort((a, b) => b.length - a.length);
    const pattern = new RegExp(`\\b(${names.join('|')})\\b`, 'g');

    findAndReplace(
      tree,
      [
        [
          pattern,
          (match) => ({
            type: 'link',
            url: `${MODELS_PAGE}#${match.toLowerCase()}`,
            title: match,
            children: [{ type: 'inlineCode', value: match }],
          }),
        ],
      ],
      { ignore: ['heading', 'link', 'linkReference', 'code', 'inlineCode'] }
    );
  };
}
