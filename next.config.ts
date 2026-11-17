import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Tree-shake large icon/editor/LiveKit barrels at build time so a module
    // that uses one icon does not ship the whole package to the browser.
    optimizePackageImports: [
      "lucide-react",
      "@supabase/supabase-js",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@livekit/components-react",
    ],
  },
};

export default nextConfig;
