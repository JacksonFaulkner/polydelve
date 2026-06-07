// @ts-nocheck
import * as __fd_glob_13 from "../content/docs/frontend/pages.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/frontend/market-ux.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/data/pipeline.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/data/models.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/data/local-dev.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/backend/vulnerability-tracking.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/backend/scoring.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/backend/prediction-markets.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/backend/api.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/introduction.mdx?collection=docs"
import { default as __fd_glob_3 } from "../content/docs/frontend/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/data/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/backend/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "backend/meta.json": __fd_glob_1, "data/meta.json": __fd_glob_2, "frontend/meta.json": __fd_glob_3, }, {"introduction.mdx": __fd_glob_4, "backend/api.mdx": __fd_glob_5, "backend/prediction-markets.mdx": __fd_glob_6, "backend/scoring.mdx": __fd_glob_7, "backend/vulnerability-tracking.mdx": __fd_glob_8, "data/local-dev.mdx": __fd_glob_9, "data/models.mdx": __fd_glob_10, "data/pipeline.mdx": __fd_glob_11, "frontend/market-ux.mdx": __fd_glob_12, "frontend/pages.mdx": __fd_glob_13, });