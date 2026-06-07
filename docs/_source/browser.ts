// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"introduction.mdx": () => import("../content/docs/introduction.mdx?collection=docs"), "backend/api.mdx": () => import("../content/docs/backend/api.mdx?collection=docs"), "backend/prediction-markets.mdx": () => import("../content/docs/backend/prediction-markets.mdx?collection=docs"), "backend/scoring.mdx": () => import("../content/docs/backend/scoring.mdx?collection=docs"), "backend/vulnerability-tracking.mdx": () => import("../content/docs/backend/vulnerability-tracking.mdx?collection=docs"), "data/local-dev.mdx": () => import("../content/docs/data/local-dev.mdx?collection=docs"), "data/models.mdx": () => import("../content/docs/data/models.mdx?collection=docs"), "data/pipeline.mdx": () => import("../content/docs/data/pipeline.mdx?collection=docs"), "frontend/market-ux.mdx": () => import("../content/docs/frontend/market-ux.mdx?collection=docs"), "frontend/pages.mdx": () => import("../content/docs/frontend/pages.mdx?collection=docs"), }),
};
export default browserCollections;