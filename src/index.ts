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

const CACHE_DURATION = 30 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: any, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders,
  });
}

Bun.serve({
  port,

  async fetch(req) {
    const requestUrl = new URL(req.url);
    const pathname = requestUrl.pathname;

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // --------------------------------------------------
    // HOME
    // --------------------------------------------------

    if (pathname === "/") {
      return json({
        status: "ok",
        service: "TeraBox Downloader API",
        version: "5.0",
        server: "online",
        endpoints: {
          health: "/health",
          api: "/api?url=TERABOX_URL",
        },
        timestamp: new Date().toISOString(),
      });
    }

    // --------------------------------------------------
    // HEALTH
    // --------------------------------------------------

    if (pathname === "/health") {
      return json({
        status: "ok",
        server: "online",
        timestamp: new Date().toISOString(),
      });
    }

    // --------------------------------------------------
    // API
    // --------------------------------------------------

    if (pathname === "/api") {
      const started = Date.now();

      try {
        const rawUrl = requestUrl.searchParams.get("url");

        if (!rawUrl || !rawUrl.trim()) {
          return json(
            {
              status: "error",
              message: "Missing required parameter: url",
              example:
                "/api?url=https://terasharefile.com/s/XXXXXXXX",
            },
            400,
          );
        }

        const targetUrl = rawUrl.trim();

        if (!isValidShareUrl(targetUrl)) {
          return json(
            {
              status: "error",
              url: targetUrl,
              message: "Invalid TeraBox share URL",
            },
            400,
          );
        }

        const surl = extractSurl(targetUrl);

        if (!surl) {
          return json(
            {
              status: "error",
              url: targetUrl,
              message: "Could not extract TeraBox share ID",
            },
            400,
          );
        }

        console.log("[API] Incoming URL:", targetUrl);
        console.log("[API] Extracted surl:", surl);

        // ------------------------------------------------
        // CACHE
        // ------------------------------------------------

        let data: any;

        const cached = cache.get(surl);

        if (cached && Date.now() < cached.expiry) {
          console.log("[CACHE] Using cached result:", surl);
          data = cached.data;
        } else {
          console.log("[CACHE] Fetching fresh result:", surl);

          data = await tera(surl);

          // Only cache successful useful results.
          if (
            data &&
            Array.isArray(data.list) &&
            data.list.length > 0
          ) {
            cache.set(surl, {
              data,
              expiry: Date.now() + CACHE_DURATION,
            });
          }
        }

        const responseTime =
          ((Date.now() - started) / 1000).toFixed(3) + "s";

        // ------------------------------------------------
        // EXTRACTION ERROR
        // ------------------------------------------------

        if (!data) {
          return json(
            {
              status: "error",
              url: targetUrl,
              surl,
              message: "TeraBox returned no response",
              response_time: responseTime,
            },
            502,
          );
        }

        if (data.error) {
          return json(
            {
              status: "error",
              url: targetUrl,
              surl,
              error: data.error,
              response_time: responseTime,
              timestamp: new Date().toISOString(),
            },
            400,
          );
        }

        // ------------------------------------------------
        // FILE LIST
        // ------------------------------------------------

        const files = Array.isArray(data.list)
          ? data.list
          : [];

        if (files.length === 0) {
          return json(
            {
              status: "error",
              url: targetUrl,
              surl,
              message: "TeraBox returned an empty file list",
              response_time: responseTime,
              timestamp: new Date().toISOString(),
            },
            404,
          );
        }

        // ------------------------------------------------
        // NORMALIZE ALL FILES
        // ------------------------------------------------

        const normalizedFiles = files.map((file: any) => ({
          filename:
            file.server_filename ||
            file.filename ||
            file.name ||
            "Unknown file",

          size:
            file.size !== undefined
              ? formatBytes(file.size)
              : undefined,

          fs_id: file.fs_id,

          download:
            file.dlink ||
            file.download_url ||
            file.download ||
            null,

          thumbs: file.thumbs || null,

          isdir:
            file.isdir !== undefined
              ? Boolean(file.isdir)
              : false,
        }));

        const first = normalizedFiles[0];

        return json({
          status: "success",
          url: targetUrl,
          surl,
          filename: first.filename,
          size: first.size,
          download: first.download,
          thumbs: first.thumbs,
          files: normalizedFiles,
          count: normalizedFiles.length,
          response_time: responseTime,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        console.error("[API ERROR]", error);

        return json(
          {
            status: "error",
            message:
              error?.message ||
              String(error) ||
              "Unknown server error",
            url: requestUrl.searchParams.get("url"),
            response_time:
              ((Date.now() - started) / 1000).toFixed(3) + "s",
          },
          500,
        );
      }
    }

    return json(
      {
        status: "error",
        message: "Not Found",
      },
      404,
    );
  },
});

console.log(
  `[SERVER] TeraBox API running on http://0.0.0.0:${port}`,
);
