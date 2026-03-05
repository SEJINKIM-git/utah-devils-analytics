/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },

  // ✅ experimental 밖으로 이동
  serverExternalPackages: ["@supabase/supabase-js"],

  // ❌ 이 블록 삭제
  // experimental: {
  //   serverComponentsExternalPackages: ["@supabase/supabase-js"],
  // },
};

module.exports = nextConfig;