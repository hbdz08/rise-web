import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  transpilePackages: [
    "@douyinfe/semi-ui-19",
    "@douyinfe/semi-icons",
    // semi-json-viewer-core ships `import` syntax in a CJS entry (no `"type":"module"`),
    // so we must force Next to bundle/transpile it for the server.
    "@douyinfe/semi-json-viewer-core",
  ],
};

export default nextConfig;
