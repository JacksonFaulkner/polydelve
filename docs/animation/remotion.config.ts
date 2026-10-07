import { Config } from "@remotion/cli/config";

Config.setEntryPoint("./src/index.ts");
// WebGL for @remotion/effects (light leak) during renders
Config.setChromiumOpenGlRenderer("angle");
Config.setPublicDir("/Users/jacksonfaulkner/code/github_repos/polydelve/docs/animation/public");
