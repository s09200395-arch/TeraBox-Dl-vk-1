import fs from "fs";
import path from "path";
import { URL } from "url";

export const ALLOWED_HOSTS = new Set([
  // TeraBox
  "terabox.com",
  "www.terabox.com",
  "terabox.app",
  "www.terabox.app",
  "dm.terabox.app",

  // TeraBox sharing domains
  "terasharefile.com",
  "www.terasharefile.com",
  "teraboxshare.com",
  "www.teraboxshare.com",
  "teraboxlink.com",
  "www.teraboxlink.com",
  "1024terabox.com",
  "www.1024terabox.com",

  // Other known TeraBox domains
  "teraboxurl.com",
  "www.teraboxurl.com",
]);

export function loadCookies(): Record<string, string> {
  let data: Record<string, any> | null = null;

  const cookieJson = process.env.COOKIE_JSON;

  if (cookieJson) {
    try {
      data = JSON.parse(cookieJson);
    } catch {
      const trimmed = cookieJson.trim();

      if (trimmed) {
        data = {
          ndus: trimmed,
        };
      }
    }
  }

  if (!data) {
    const raw = process.env.TERABOX_COOKIES_JSON;

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
    }
  }

  if (!data) {
    const filePath = process.env.TERABOX_COOKIES_FILE;

    if (filePath) {
      try {
        const resolvedPath = path.resolve(filePath);

        if (fs.existsSync(resolvedPath)) {
          const fileContent = fs.readFileSync(
            resolvedPath,
            "utf-8",
          );

          data = JSON.parse(fileContent);
        }
      } catch {
        data = null;
      }
    }
  }

  if (data && typeof data === "object") {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        result[key] = String(value);
      }
    }

    return result;
  }

  return {};
}

export function isValidShareUrl(input: string): boolean {
  try {
    const parsed = new URL(input.trim());

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();

    if (!ALLOWED_HOSTS.has(host)) {
      return false;
    }

    // /s/xxxxxx
    if (/\/s\/[^/?#]+/i.test(parsed.pathname)) {
      return true;
    }

    // ?surl=xxxxxx
    if (parsed.searchParams.get("surl")) {
      return true;
    }

    // Some TeraBox links can contain the share code elsewhere
    if (
      parsed.pathname.includes("/share/") ||
      parsed.pathname.includes("/wap/share/")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function extractSurl(input: string): string | null {
  try {
    const parsed = new URL(input.trim());

    // ?surl=xxxxx
    const surlParam = parsed.searchParams.get("surl");

    if (surlParam) {
      return surlParam.trim();
    }

    // /s/xxxxx
    const shareMatch = parsed.pathname.match(
      /\/s\/([^/?#]+)/i,
    );

    if (shareMatch?.[1]) {
      return shareMatch[1].trim();
    }

    // /share/xxxxx
    const shareMatch2 = parsed.pathname.match(
      /\/share\/([^/?#]+)/i,
    );

    if (shareMatch2?.[1]) {
      return shareMatch2[1].trim();
    }

    // /wap/share/xxxxx
    const shareMatch3 = parsed.pathname.match(
      /\/wap\/share\/([^/?#]+)/i,
    );

    if (shareMatch3?.[1]) {
      return shareMatch3[1].trim();
    }

    return null;
  } catch {
    return null;
  }
}

export function formatBytes(
  bytes: number | string,
  decimals = 2,
): string {
  const b =
    typeof bytes === "string"
      ? Number.parseInt(bytes, 10)
      : bytes;

  if (!Number.isFinite(b) || b <= 0) {
    return "0 Bytes";
  }

  const k = 1024;

  const dm = Math.max(0, decimals);

  const sizes = [
    "Bytes",
    "KB",
    "MB",
    "GB",
    "TB",
    "PB",
    "EB",
    "ZB",
    "YB",
  ];

  const i = Math.floor(
    Math.log(b) / Math.log(k),
  );

  return `${Number(
    (b / Math.pow(k, i)).toFixed(dm),
  )} ${sizes[i]}`;
}
