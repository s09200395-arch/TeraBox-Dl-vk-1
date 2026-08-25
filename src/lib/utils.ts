export function loadCookies(): Record<string, string> {
  const result: Record<string, string> = {};

  // --------------------------------------------------
  // 1. COOKIE_JSON from Railway
  // --------------------------------------------------

  const cookieJson = process.env.COOKIE_JSON;

  if (cookieJson) {
    try {
      const parsed = JSON.parse(cookieJson);

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        for (const [name, value] of Object.entries(parsed)) {
          if (
            typeof value === "string" &&
            value.length > 0
          ) {
            result[name] = value;
          }
        }
      }

      console.log(
        "[COOKIES] COOKIE_JSON loaded:",
        Object.keys(result),
      );
    } catch (error) {
      console.log(
        "[COOKIES] COOKIE_JSON parse failed:",
        error,
      );
    }
  }

  // --------------------------------------------------
  // 2. TERABOX_COOKIE / TERABOX_COOKIES / COOKIE
  // --------------------------------------------------

  const envCookie =
    process.env.TERABOX_COOKIE ||
    process.env.TERABOX_COOKIES ||
    process.env.COOKIE;

  if (envCookie) {
    for (const part of envCookie.split(";")) {
      const index = part.indexOf("=");

      if (index === -1) continue;

      const name =
        part.slice(0, index).trim();

      const value =
        part.slice(index + 1).trim();

      if (name && value) {
        result[name] = value;
      }
    }
  }

  // --------------------------------------------------
  // 3. Individual Railway cookie variables
  // --------------------------------------------------

  const possibleCookies = [
    "ndus",
    "BDUSS",
    "STOKEN",
    "BAIDUID",
    "PANPSC",
    "BOXCLND",
    "sekey",
  ];

  for (const name of possibleCookies) {
    const value = process.env[name];

    if (value) {
      result[name] = value;
    }
  }

  console.log(
    "[COOKIES] Final cookies:",
    Object.keys(result),
  );

  return result;
}

// --------------------------------------------------
// Supported TeraBox share domains
// --------------------------------------------------

export function isValidShareUrl(
  input: string,
): boolean {
  try {
    const url = new URL(input);

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return false;
    }

    const hostname =
      url.hostname.toLowerCase();

    const supported = [
      "terabox.app",
      "www.terabox.app",

      "terabox.com",
      "www.terabox.com",

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
    ];

    return supported.some(
      (domain) =>
        hostname === domain ||
        hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

// --------------------------------------------------
// Extract SURL
// --------------------------------------------------

export function extractSurl(
  input: string,
): string | null {
  try {
    const value = input.trim();

    // Direct ID
    if (
      /^[A-Za-z0-9_-]+$/.test(value) &&
      !value.includes("/")
    ) {
      return value.startsWith("1")
        ? value.slice(1)
        : value;
    }

    const url = new URL(value);

    // ?surl=xxxx
    const querySurl =
      url.searchParams.get("surl");

    if (querySurl) {
      return querySurl.startsWith("1")
        ? querySurl.slice(1)
        : querySurl;
    }

    // /s/xxxx
    const match =
      url.pathname.match(
        /\/s\/([A-Za-z0-9_-]+)/i,
      );

    if (match?.[1]) {
      const id = match[1];

      return id.startsWith("1")
        ? id.slice(1)
        : id;
    }

    return null;
  } catch {
    return null;
  }
}

// --------------------------------------------------
// Format bytes
// --------------------------------------------------

export function formatBytes(
  value:
    | number
    | string
    | null
    | undefined,
): string {
  const bytes = Number(value);

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
