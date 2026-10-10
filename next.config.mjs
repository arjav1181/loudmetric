/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // small image for the Docker/HF image
  poweredByHeader: false,

  /**
   * The Hugging Face proxy was serving the HTML with `s-maxage=31536000`,
   * which is a year-long cache on a document that changes every deploy.
   *
   * It hid a real fix for several rounds: the dashboard button was in the
   * shipped JavaScript, the live HTML referenced the right chunk, and it still
   * did not appear — because the browser was being served a year-old document
   * that pointed at last deploy's chunk, which no longer exists under that name.
   *
   * Hashed assets keep their immutable year-long cache, which is correct. Only
   * the HTML is volatile.
   */
  async headers() {
    return [
      {
        // Everything except content-hashed assets, which keep their immutable
        // year-long cache. Blanket-applying this to /_next/static would throw
        // away caching for every JS chunk on the site to fix a problem that
        // only affects documents.
        source: "/:path((?!_next/static|_next/image).*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
