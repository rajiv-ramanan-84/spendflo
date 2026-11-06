import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This app lives in a subfolder of the spendflo repo; keep Turbopack scoped to it.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
