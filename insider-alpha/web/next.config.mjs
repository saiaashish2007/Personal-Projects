/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // Static export has no image optimizer, and the site ships no raster images anyway.
  images: { unoptimized: true },
  // Emits `page/index.html` rather than `page.html`, so every route works as a
  // directory URL on any static host without rewrite rules.
  trailingSlash: true,
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
