// source.config.ts
import { defineDocs, defineConfig } from "fumadocs-mdx/config";
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";

// plugins/remark-model-links.mjs
import { findAndReplace } from "mdast-util-find-and-replace";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
var MODELS_PAGE = "/docs/data/models";
function remarkModelLinks() {
  return (tree) => {
    const manifestPath = join(process.cwd(), "model-manifest.json");
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const names = manifest.map((m) => m.name).filter(Boolean);
    if (names.length === 0) return;
    names.sort((a, b) => b.length - a.length);
    const pattern = new RegExp(`\\b(${names.join("|")})\\b`, "g");
    findAndReplace(
      tree,
      [
        [
          pattern,
          (match) => ({
            type: "link",
            url: `${MODELS_PAGE}#${match.toLowerCase()}`,
            title: match,
            children: [{ type: "inlineCode", value: match }]
          })
        ]
      ],
      { ignore: ["heading", "link", "linkReference", "code", "inlineCode"] }
    );
  };
}

// source.config.ts
var docs = defineDocs({
  dir: "content/docs"
});
var source_config_default = defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid, remarkModelLinks]
  }
});
export {
  source_config_default as default,
  docs
};
