import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // External packages for server-side rendering (Next.js 16+)
  serverExternalPackages: ['ssh2', 'ssh2-sftp-client', 'ssh2-streams', 'cpu-features'],
};

export default nextConfig;
