import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

const deployingToPages = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  site: "https://slicedearth.github.io",
  base: deployingToPages ? "/controlcurrent" : "/",
  output: "static",
  trailingSlash: "always",
  integrations: [sitemap()],
  build: {
    format: "directory"
  }
});
