import type { NextConfig } from "next";

const nextConfig: NextConfig = {
allowedDevOrigins: ['192.168.0.129',`10.53.148.125`, 'tilt-tiger-recliner.ngrok-free.dev'],
async rewrites() {
    return [
      {
        source: '/api/server/:path*',
        destination: 'http://localhost:4575/api/v1/:path*',
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://localhost:4575/socket.io/:path*',
      },
    ]
  },
};

export default nextConfig;
