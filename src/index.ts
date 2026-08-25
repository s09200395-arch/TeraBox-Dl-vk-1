import { tera } from "./lib/terabox";
import {
  isValidShareUrl,
  extractSurl,
  formatBytes,
} from "./lib/utils";

const port = Number(process.env.PORT || 8080);

const cache = new Map<
  string,
  {
    data: any;
    expiry: number;
  }
>();

const CACHE_DURATION = 2 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: any, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

Bun.serve({
  port,

  async fetch(req) {
    const requestUrl = new URL(req.url);
    const pathname = requestUrl.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // =========================
    // HOME / HEALTH CHECK
    // =========================

    if (pathname === "/" || pathname === "/health") {
      return json({
        status: "ok",
        service: "TeraBox Downloader API",
        version: "4.0",
        server: "online",
        timestamp: new Date().toISOString(),
      });
    }

    // =========================
    // API
    // =========================

    if (pathname === "/api") {
      const startTime = Date.now();

      try {
        const targetUrlRaw =
          requestUrl.searchParams.get("url");

        // Missing URL
        if (!targetUrlRaw || !targetUrlRaw.trim()) {
          return json(
            {
              status: "error",
              message: "Missing required parameter: url",
              example:
                "/api?url=https://terabox.app/s/1HSEb8PZRUE7Z1Tvd3ZtT0g",
            },
            400,
          );
        }

        const targetUrl = targetUrlRaw.trim();

        console.log(
          "[API] Incoming URL:",
          targetUrl,
        );

        // Validate URL
        if (!isValidShareUrl(targetUrl)) {
          console.log(
            "[API] Invalid share URL:",
            targetUrl,
          );

          return json(
            {
              status: "error",
              url: targetUrl,
              message: "Invalid TeraBox share URL",
            },
            400,
          );
        }

        // Extract surl
        const surl = extractSurl(targetUrl);

        if (!surl) {
          return json(
            {
              status: "error",
              url: targetUrl,
              message:
                "Could not extract share ID from URL",
            },
            400,
          );
        }

        console.log("[API] Extracted surl:", surl);

        // =========================
        // CACHE
        // =========================

        let data: any;

        const cached = cache.get(surl);

        if (
          cached &&
          Date.now() < cached.expiry
        ) {
          console.log(
            "[CACHE] Using cached result:",
            surl,
          );

          data = cached.data;
        } else {
          console.log(
            "[TERABOX] Fetching fresh result...",
          );

          data = await tera(surl);

          cache.set(surl, {
            data,
            expiry:
              Date.now() + CACHE_DURATION,
          });
        }

        const responseTime =
          ((Date.now() - startTime) / 1000).toFixed(
            3,
          ) + "s";

        // Extraction error
        if (!data || data.error) {
          console.error(
            "[TERABOX] Extraction error:",
            data?.error,
          );

          return json(
            {
              status: "error",
              url: targetUrl,
              surl,
              error:
                data?.error ||
                "TeraBox extraction failed",
              response_time: responseTime,
              timestamp:
                new Date().toISOString(),
            },
            400,
          );
        }

        // =========================
        // FILE DATA
        // =========================

        const list = Array.isArray(data.list)
          ? data.list
          : [];

        if (list.length === 0) {
          return json(
            {
              status: "error",
              url: targetUrl,
              surl,
              message:
                "No files found in this TeraBox share",
              response_time: responseTime,
              timestamp:
                new Date().toISOString(),
            },
            404,
          );
        }

        const firstItem = list[0];

        const filename =
          firstItem.server_filename ||
          firstItem.filename ||
          "TeraBox File";

        const rawSize =
          firstItem.size ?? 0;

        const size = formatBytes(rawSize);

        const download =
          firstItem.dlink ||
          firstItem.download ||
          null;

        const thumbs =
          firstItem.thumbs || null;

        // No direct link
        if (!download) {
          console.error(
            "[TERABOX] No download link returned",
          );

          return json(
            {
              status: "error",
              url: targetUrl,
              surl,
              filename,
              size,
              message:
                "TeraBox returned no download link",
              response_time: responseTime,
              timestamp:
                new Date().toISOString(),
            },
            400,
          );
        }

        // =========================
        // SUCCESS
        // =========================

        console.log(
          "[SUCCESS]",
          filename,
          size,
        );

        return json({
          status: "success",

          url: targetUrl,

          surl,

          filename,

          size,

          download,

          ...(thumbs
            ? { thumbs }
            : {}),

          // Return complete original list too
          // for future Telegram bot features
          files: list,

          response_time:
            responseTime,

          timestamp:
            new Date().toISOString(),
        });
      } catch (error: any) {
        console.error(
          "[API ERROR]",
          error,
        );

        const responseTime =
          ((Date.now() - startTime) / 1000).toFixed(
            3,
          ) + "s";

        return json(
          {
            status: "error",

            message:
              error?.message ||
              String(error),

            url:
              requestUrl.searchParams.get(
                "url",
              ),

            response_time:
              responseTime,

            timestamp:
              new Date().toISOString(),
          },
          500,
        );
      }
    }

    // =========================
    // 404
    // =========================

    return json(
      {
        status: "error",
        message: "Endpoint not found",
        available_endpoints: {
          health: "/",
          api: "/api?url=TERABOX_SHARE_URL",
        },
      },
      404,
    );
  },
});

console.log(
  `[SERVER] Starting on 0.0.0.0:${port}`,
);

console.log(
  `[SERVER] TeraBox API running on http://0.0.0.0:${port}`,
);
