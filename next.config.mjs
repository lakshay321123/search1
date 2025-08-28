// @ts-check
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: {} },
  env: {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || "dummy",
    GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID || "dummy",
    GOOGLE_CSE_KEY: process.env.GOOGLE_CSE_KEY || "dummy"
  }
};
export default nextConfig;
