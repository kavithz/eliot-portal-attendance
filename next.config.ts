import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/reports/export": ["./node_modules/pdfkit/js/standard-fonts/*.cjs"],
    "/admin/reports/export": ["./node_modules/pdfkit/js/standard-fonts/*.cjs"],
  },
};

export default nextConfig;