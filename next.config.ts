import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['169.254.50.114'],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
