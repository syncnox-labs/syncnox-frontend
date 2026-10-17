import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    if (process.env.NEXT_PUBLIC_ENVIRONMENT === "development") {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;

      if (!serverUrl) {
        throw new Error("NEXT_PUBLIC_SERVER_URL must be set in development");
      }

      return [
        {
          source: "/api-proxy/:path*",
          destination: `${serverUrl.replace(/\/$/, "")}/api/:path*`,
        },
      ];
    }

    return [];
  },
};

export default nextConfig;

// import type { NextConfig } from "next";

// const nextConfig: NextConfig = {};

// export default nextConfig;
