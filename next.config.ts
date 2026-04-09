import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-src 'self' https://*.google.com https://drive.google.com https://www.youtube.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
