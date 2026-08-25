// ======================================================
// TeraBox Downloader - utils.ts
// Final Cookie + URL Utility
// ======================================================

export type CookieMap = Record<string, string>;

// ------------------------------------------------------
// SAFE STRING
// ------------------------------------------------------

function cleanString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

// ------------------------------------------------------
// ADD COOKIE SAFELY
// ------------------------------------------------------

function addCookie(
  result: CookieMap,
  name: unknown,
  value: unknown,
): void {
  const cookieName = cleanString(name);
  const cookieValue = cleanString(value);

  if (!cookieName || !cookieValue) {
    return;
  }

  result[cookieName] = cookieValue;
}

// ------------------------------------------------------
// PARSE COOKIE HEADER
// Example:
// ndus=xxxx; BAIDUID=xxxx; STOKEN=xxxx
// ------------------------------------------------------

function parseCookieHeader(
  input: string,
): CookieMap {
  const result: CookieMap = {};

  const text = cleanString(input);

  if (!text) {
    return result;
  }

  for (const part of text.split(";")) {
    const item = part.trim();

    if (!item) {
      continue;
    }

    const index = item.indexOf("=");

    if (index <= 0) {
      continue;
    }

    const name = item
      .slice(0, index)
      .trim();

    const value = item
      .slice(index + 1)
      .trim();

    addCookie(result, name, value);
  }

  return result;
}

// ------------------------------------------------------
// PARSE COOKIE JSON
//
// Supported:
// {"ndus":"xxxx","BDUSS":"xxxx"}
//
// Also supports:
// [{"name":"ndus","value":"xxxx"}]
// ------------------------------------------------------

function parseCookieJson(
  input: unknown,
): CookieMap {
  const result: CookieMap = {};

  if (input === null || input === undefined) {
    return result;
  }

  // Already an object
  if (
    typeof input === "object" &&
    !Array.isArray(input)
  ) {
    const object = input as Record<
      string,
      unknown
    >;

    for (const [name, value] of Object.entries(
      object,
    )) {
      if (
        typeof value === "string" ||
        typeof value === "number"
      ) {
        addCookie(
          result,
          name,
          String(value),
        );
      }
    }

    return result;
  }

  // JSON string
  if (typeof input !== "string") {
    return result;
  }

  const text = input.trim();

  if (!text) {
    return result;
  }

  // Try JSON first
  try {
    const parsed = JSON.parse(text);

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      const object =
        parsed as Record<string, unknown>;

      for (const [name, value] of Object.entries(
        object,
      )) {
        if (
          typeof value === "string" ||
          typeof value === "number"
        ) {
          addCookie(
            result,
            name,
            String(value),
          );
        }
      }

      return result;
    }

    // Cookie array format
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (
          item &&
          typeof item === "object"
        ) {
          const cookie =
            item as Record<
              string,
              unknown
            >;

          addCookie(
            result,
            cookie.name,
            cookie.value,
          );
        }
      }

      return result;
    }
  } catch {
    // Not JSON.
    // Try normal Cookie header.
  }

  return parseCookieHeader(text);
}

// ------------------------------------------------------
// LOAD COOKIES
// ------------------------------------------------------

export function loadCookies(): CookieMap {
  const result: CookieMap = {};

  // ----------------------------------------------------
  // 1. COOKIE_JSON
  // ----------------------------------------------------

  const cookieJson =
    process.env.COOKIE_JSON;

  if (cookieJson) {
    const parsed =
      parseCookieJson(cookieJson);

    Object.assign(result, parsed);
  }

  // ----------------------------------------------------
  // 2. TERABOX_COOKIE
  // ----------------------------------------------------

  const teraboxCookie =
    process.env.TERABOX_COOKIE;

  if (teraboxCookie) {
    const parsed =
      parseCookieHeader(teraboxCookie);

    Object.assign(result, parsed);
  }

  // ----------------------------------------------------
  // 3. TERABOX_COOKIES
  // ----------------------------------------------------

  const teraboxCookies =
    process.env.TERABOX_COOKIES;

  if (teraboxCookies) {
    const parsed =
      parseCookieJson(teraboxCookies);

    Object.assign(result, parsed);
  }

  // ----------------------------------------------------
  // 4. Generic COOKIE
  // ----------------------------------------------------

  const genericCookie =
    process.env.COOKIE;

  if (genericCookie) {
    const parsed =
      parseCookieJson(genericCookie);

    Object.assign(result, parsed);
  }

  // ----------------------------------------------------
  // 5. Individual cookie variables
  // ----------------------------------------------------

  const possibleCookies = [
    "ndus",
    "BDUSS",
    "STOKEN",
    "BAIDUID",
    "PANPSC",
    "csrfToken",
    "csrf_token",
    "sessionid",
    "session_id",
  ];

  for (const name of possibleCookies) {
    const value =
      process.env[name];

    if (value) {
      addCookie(
        result,
        name,
        value,
      );
    }
  }

  return result;
}

// ------------------------------------------------------
// COOKIE HEADER
// ------------------------------------------------------

export function cookieHeader(
  cookies: CookieMap,
): string {
  return Object.entries(cookies)
    .filter(
      ([name, value]) =>
        Boolean(name) &&
        value !== undefined &&
        value !== null &&
        String(value).length > 0,
    )
    .map(
      ([name, value]) =>
        `${name}=${value}`,
    )
    .join("; ");
}

// ------------------------------------------------------
// VALID TeraBox SHARE DOMAINS
// ------------------------------------------------------

const SUPPORTED_DOMAINS = [
  "terabox.app",
  "terabox.com",
  "1024terabox.com",
  "teraboxshare.com",
  "teraboxlink.com",
  "terasharefile.com",
  "terafileshare.com",
  "terasharelink.com",
];

// ------------------------------------------------------
// DOMAIN CHECK
// ------------------------------------------------------

function isSupportedHost(
  hostname: string,
): boolean {
  const host =
    hostname.toLowerCase().trim();

  return SUPPORTED_DOMAINS.some(
    (domain) =>
      host === domain ||
      host.endsWith(`.${domain}`),
  );
}

// ------------------------------------------------------
// VALID SHARE URL
// ------------------------------------------------------

export function isValidShareUrl(
  input: string,
): boolean {
  try {
    const value = cleanString(input);

    if (!value) {
      return false;
    }

    const url =
      new URL(value);

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return false;
    }

    return isSupportedHost(
      url.hostname,
    );
  } catch {
    return false;
  }
}

// ------------------------------------------------------
// EXTRACT SURL
// ------------------------------------------------------

export function extractSurl(
  input: string,
): string | null {
  try {
    const value =
      cleanString(input);

    if (!value) {
      return null;
    }

    // --------------------------------------------------
    // Direct SURL / ID
    // --------------------------------------------------

    if (
      /^[A-Za-z0-9_-]+$/.test(value)
    ) {
      const id =
        value.startsWith("1")
          ? value.slice(1)
          : value;

      return id || null;
    }

    // --------------------------------------------------
    // URL
    // --------------------------------------------------

    const url =
      new URL(value);

    // ?surl=xxxx
    const querySurl =
      url.searchParams.get("surl");

    if (querySurl) {
      const decoded =
        decodeURIComponent(
          querySurl,
        ).trim();

      const id =
        decoded.startsWith("1")
          ? decoded.slice(1)
          : decoded;

      return id || null;
    }

    // /s/xxxx
    const match =
      url.pathname.match(
        /\/s\/([A-Za-z0-9_-]+)/i,
      );

    if (match?.[1]) {
      const id =
        match[1].startsWith("1")
          ? match[1].slice(1)
          : match[1];

      return id || null;
    }

    return null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------
// FORMAT BYTES
// ------------------------------------------------------

export function formatBytes(
  value:
    | number
    | string
    | null
    | undefined,
): string {
  const bytes =
    Number(value);

  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return "0 Bytes";
  }

  const units = [
    "Bytes",
    "KB",
    "MB",
    "GB",
    "TB",
    "PB",
  ];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) /
        Math.log(1024),
    ),
    units.length - 1,
  );

  const size =
    bytes /
    Math.pow(1024, index);

  return `${size.toFixed(
    index === 0 ? 0 : 2,
  )} ${units[index]}`;
}

// ------------------------------------------------------
// OPTIONAL: BUILD COOKIE HEADER
// ------------------------------------------------------

export function getCookieHeader(): string {
  return cookieHeader(
    loadCookies(),
  );
}
