import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone",
  // The framework's own trailing-slash redirect carries no headers at all, so
  // removing it makes both spellings of a route ordinary responses with full
  // coverage (R-47, as amended 2026-09-21).
  skipTrailingSlashRedirect: true,
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
