import fs from "fs";
import path from "path";
import { URL } from "url";

export const ALLOWED_HOSTS = new Set([
  "terabox.com",
  "www.terabox.com",

  "terabox.app",
  "www.terabox.app",

  "1024terabox.com",
  "www.1024terabox.com",

  "teraboxshare.com",
  "www.teraboxshare.com",

  "teraboxlink.com",
  "www.teraboxlink.com",

  "terasharefile.com",
  "www.terasharefile.com",

  "terafileshare.com",
  "www.terafileshare.com",

  "terasharelink.com",
  "www.terasharelink.com",

  "dm.terabox.app",
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
        data = { ndus: trimmed };
      }
    }
  }

  if (!data) {
    const raw = process.env.TERABOX_COOKIES_JSON;

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {}
    }
  }

  if (!data) {
    const filePath = process.env.TERABOX_COOKIES_FILE;

    if (filePath) {
      try {
        const resolved = path.resolve(filePath);

        if (fs.existsSync(resolved)) {
          const content = fs.readFileSync(resolved, "utf8");
          data = JSON.parse(content);
        }
      } catch {}
    }
  }

  if (!data || typeof data !== "object") {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }

  return result;
}

export function isValidShareUrl(input: string): boolean {
  try {
    const parsed = new URL(input.trim());

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();

    if (!ALLOWED_HOSTS.has(host)) {
      return false;
    }

    const pathname = parsed.pathname.toLowerCase();

    const hasPathShare = /\/s\/[a-zA-Z0-9_-]+/.test(pathname);

    const hasSurl =
      parsed.searchParams.has("surl") &&
      !!parsed.searchParams.get("surl");

    return hasPathShare || hasSurl;
  } catch {
    return false;
  }
}

export function extractSurl(input: string): string | null {
  try {
    const parsed = new URL(input.trim());

    // ?surl=xxxx
    const querySurl = parsed.searchParams.get("surl");

    if (querySurl) {
      return querySurl.trim();
    }

    // /s/xxxx
    const match = parsed.pathname.match(
      /\/s\/([a-zA-Z0-9_-]+)/i,
    );

    if (match?.[1]) {
      return match[1];
    }

    return null;
  } catch {
    return null;
  }
}

export function normalizeSurl(value: string): {
  surlParam: string;
  shortUrl: string;
} {
  let key = value.trim();

  key = key.replace(/^\/+|\/+$/g, "");

  /*
   * TeraBox shares can appear with a leading "1".
   * Keep both versions available because different
   * endpoints expect different forms.
   */

  if (key.startsWith("1") && key.length > 1) {
    return {
      surlParam: key,
      shortUrl: key.substring(1),
    };
  }

  return {
    surlParam: `1${key}`,
    shortUrl: key,
  };
}

export function formatBytes(
  bytes: number | string,
  decimals = 2,
): string {
  const value =
    typeof bytes === "string"
      ? Number(bytes)
      : Number(bytes);

  if (!Number.isFinite(value) || value <= 0) {
    return "0 Bytes";
  }

  const k = 1024;

  const sizes = [
    "Bytes",
    "KB",
    "MB",
    "GB",
    "TB",
    "PB",
    "EB",
  ];

  const i = Math.floor(
    Math.log(value) / Math.log(k),
  );

  const index = Math.min(i, sizes.length - 1);

  return `${parseFloat(
    (value / Math.pow(k, index)).toFixed(
      decimals < 0 ? 0 : decimals,
    ),
  )} ${sizes[index]}`;
}
