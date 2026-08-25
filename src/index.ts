import { tera } from "./lib/terabox";
import {
  isValidShareUrl,
  extractSurl,
  formatBytes,
} from "./lib/utils";

const PORT = Number(process.env.PORT || 8080);
const HOST = "0.0.0.0";

const cache = new Map<
  string,
  {
    data: any;
    expiry: number;
  }
>();

const CACHE_DURATION =
  2 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type",
};

function json(
  data: any,
  status = 200,
) {
  return Response.json(data, {
    status,
    headers: corsHeaders,
  });
}

console.log(
  `[SERVER] Starting on ${HOST}:${PORT}`,
);

const server = Bun.serve({
  hostname: HOST,
  port: PORT,

  async fetch(req) {
    try {
      const url = new URL(req.url);
      const pathname = url.pathname;

      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      }

      // Health check
      if (
        pathname === "/" ||
        pathname === "/health"
      ) {
        return json({
          status: "ok",
          service: "TeraBox Downloader API",
          version: "4.0",
          server: "online",
          timestamp:
            new Date().toISOString(),
        });
      }

      if (pathname !== "/api") {
        return json(
          {
            status: "error",
            message: "Endpoint not found",
          },
          404,
        );
      }

      const started = Date.now();

      const rawUrl =
        url.searchParams.get("url");

      if (!rawUrl) {
        return json(
          {
            status: "error",
            message:
              "Missing required parameter: url",
            example:
              "/api?url=https://terasharefile.com/s/example",
          },
          400,
        );
      }

      const targetUrl =
        rawUrl.trim();

      console.log(
        "[API] Requested:",
        targetUrl,
      );

      if (
        !isValidShareUrl(targetUrl)
      ) {
        return json(
          {
            status: "error",
            url: targetUrl,
            message:
              "Invalid TeraBox share URL",
          },
          400,
        );
      }

      const surl =
        extractSurl(targetUrl);

      if (!surl) {
        return json(
          {
            status: "error",
            url: targetUrl,
            message:
              "Could not extract share ID",
          },
          400,
        );
      }

      console.log(
        "[API] Extracted surl:",
        surl,
      );

      let data: any;

      const cached =
        cache.get(surl);

      if (
        cached &&
        Date.now() < cached.expiry
      ) {
        console.log(
          "[CACHE] Using cached result",
        );

        data = cached.data;
      } else {
        console.log(
          "[TERABOX] Fetching...",
        );

        data = await tera(surl);

        if (data) {
          cache.set(surl, {
            data,
            expiry:
              Date.now() +
              CACHE_DURATION,
          });
        }
      }

      const responseTime =
        (
          (Date.now() - started) /
          1000
        ).toFixed(3) + "s";

      if (!data) {
        return json(
          {
            status: "error",
            message:
              "Empty response from TeraBox",
            response_time:
              responseTime,
          },
          502,
        );
      }

      if (data.error) {
        console.error(
          "[TERABOX ERROR]",
          data.error,
        );

        return json(
          {
            status: "error",
            url: targetUrl,
            surl,
            message: data.error,
            response_time:
              responseTime,
            timestamp:
              new Date().toISOString(),
          },
          502,
        );
      }

      const list =
        Array.isArray(data.list)
          ? data.list
          : [];

      if (list.length === 0) {
        return json({
          status: "success",
          url: targetUrl,
          surl,
          files: [],
          message:
            "No files returned by TeraBox",
          response_time:
            responseTime,
        });
      }

      const files = list.map(
        (item: any) => ({
          filename:
            item.server_filename ||
            item.filename ||
            "Unknown",

          size:
            item.size !== undefined
              ? formatBytes(item.size)
              : "Unknown",

          download:
            item.dlink ||
            item.download_url ||
            null,

          thumbnail:
            item.thumbs?.url3 ||
            item.thumbs?.url2 ||
            item.thumbs?.url1 ||
            item.thumbs ||
            null,
        }),
      );

      const first = files[0];

      return json({
        status: "success",
        url: targetUrl,
        surl,
        filename: first.filename,
        size: first.size,
        download: first.download,
        thumbs: first.thumbnail,
        files,
        response_time:
          responseTime,
        timestamp:
          new Date().toISOString(),
      });
    } catch (error: any) {
      console.error(
        "[SERVER ERROR]",
        error,
      );

      return json(
        {
          status: "error",
          message:
            error?.message ||
            String(error),
        },
        500,
      );
    }
  },
});

console.log(
  `[SERVER] TeraBox API running on http://${HOST}:${server.port}`,
);
