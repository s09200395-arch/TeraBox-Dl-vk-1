import { loadCookies } from "./utils";

type CookieMap = Record<string, string>;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/145.0.0.0 Safari/537.36";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ------------------------------------------------------
// COOKIE HELPERS
// ------------------------------------------------------

function getCookies(): CookieMap {
  let cookies: CookieMap = {};

  try {
    const loaded = loadCookies();

    if (loaded && typeof loaded === "object") {
      cookies = {
        ...loaded,
      };
    }
  } catch (error) {
    console.log("[TERABOX] Cookie loader warning:", error);
  }

  // Optional Railway environment cookie.
  const envCookie =
    process.env.TERABOX_COOKIE ||
    process.env.TERABOX_COOKIES ||
    process.env.COOKIE;

  if (envCookie) {
    for (const part of envCookie.split(";")) {
      const index = part.indexOf("=");

      if (index === -1) continue;

      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();

      if (name && value) {
        cookies[name] = value;
      }
    }
  }

  return cookies;
}

function cookieHeader(cookies: CookieMap) {
  return Object.entries(cookies)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

// ------------------------------------------------------
// JS TOKEN
// ------------------------------------------------------

function extractJsToken(html: string): string | null {
  const patterns = [
    /fn%28%22(.*?)%22%29/,
    /fn\("([^"]+)"\)/,
    /jsToken\s*=\s*["']([^"']+)["']/i,
    /jsToken["']?\s*:\s*["']([^"']+)["']/i,
    /window\.jsToken\s*=\s*["']([^"']+)["']/i,
    /"jsToken"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

// ------------------------------------------------------
// URL VARIANTS
// ------------------------------------------------------

function buildShortUrlVariants(surl: string) {
  const clean = surl.trim();

  const withoutOne = clean.startsWith("1")
    ? clean.slice(1)
    : clean;

  const withOne = withoutOne.startsWith("1")
    ? withoutOne
    : `1${withoutOne}`;

  return Array.from(
    new Set([
      withoutOne,
      withOne,
      clean,
    ]),
  );
}

// ------------------------------------------------------
// SHARE PAGE
// ------------------------------------------------------

async function getSharePage(
  host: string,
  surl: string,
  cookies: CookieMap,
) {
  const variants = buildShortUrlVariants(surl);

  for (const short of variants) {
    const pageUrl =
      `https://${host}/sharing/link?surl=` +
      encodeURIComponent(short);

    console.log("[TERABOX] Fetching page:", pageUrl);

    try {
      const response = await fetch(pageUrl, {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: cookieHeader(cookies),
          Referer: `https://${host}/`,
        },
        redirect: "follow",
      });

      console.log(
        "[TERABOX] Page status:",
        response.status,
        host,
        short,
      );

      if (!response.ok) {
        continue;
      }

      const text = await response.text();

      const jsToken = extractJsToken(text);

      if (jsToken) {
        console.log("[TERABOX] jsToken extracted");
        return {
          jsToken,
          shortUrl: short,
        };
      }
    } catch (error) {
      console.log(
        "[TERABOX] Page request failed:",
        error,
      );
    }
  }

  return null;
}

// ------------------------------------------------------
// SHARE LIST
// ------------------------------------------------------

async function requestShareList(
  apiHost: string,
  jsToken: string,
  shortUrl: string,
  cookies: CookieMap,
) {
  const apiUrl = new URL(
    `https://${apiHost}/share/list`,
  );

  apiUrl.searchParams.set("app_id", "250528");
  apiUrl.searchParams.set("jsToken", jsToken);
  apiUrl.searchParams.set(
    "site_referer",
    "https://www.terabox.app/",
  );
  apiUrl.searchParams.set("shorturl", shortUrl);
  apiUrl.searchParams.set("root", "1");

  console.log(
    "[TERABOX] Share API:",
    apiUrl.toString(),
  );

  const response = await fetch(apiUrl.toString(), {
    method: "GET",

    headers: {
      Host: apiHost,
      "User-Agent": USER_AGENT,
      Accept:
        "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      Referer:
        `https://${apiHost}/sharing/link?surl=${encodeURIComponent(shortUrl)}`,
      Origin: `https://${apiHost}`,
      Cookie: cookieHeader(cookies),
    },
  });

  console.log(
    "[TERABOX] Share API status:",
    response.status,
  );

  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    console.log(
      "[TERABOX] Invalid JSON:",
      text.slice(0, 300),
    );

    return null;
  }
}

// ------------------------------------------------------
// NORMALIZE RESPONSE
// ------------------------------------------------------

function normalizeResponse(data: any) {
  if (!data) {
    return null;
  }

  if (
    Array.isArray(data.list) &&
    data.list.length > 0
  ) {
    return data;
  }

  // Some responses wrap the list.
  if (
    data.data &&
    Array.isArray(data.data.list) &&
    data.data.list.length > 0
  ) {
    return {
      ...data,
      list: data.data.list,
    };
  }

  if (
    data.data?.list &&
    typeof data.data.list === "object"
  ) {
    const list = Object.values(
      data.data.list,
    );

    if (list.length > 0) {
      return {
        ...data,
        list,
      };
    }
  }

  return data;
}

// ------------------------------------------------------
// MAIN
// ------------------------------------------------------

export async function tera(
  surl: string,
): Promise<any> {
  console.log(
    "[TERABOX] Starting extraction:",
    surl,
  );

  const cookies = getCookies();

  console.log(
    "[TERABOX] Cookies loaded:",
    Object.keys(cookies),
  );

  /*
   * Try current domains one by one.
   *
   * dm.terabox.app is preferred.
   * 1024tera.com and terabox.com are fallbacks.
   */

  const hosts = [
    {
      page: "dm.terabox.app",
      api: "dm.terabox.app",
    },
    {
      page: "www.1024tera.com",
      api: "www.1024tera.com",
    },
    {
      page: "www.terabox.com",
      api: "www.terabox.com",
    },
  ];

  let lastError =
    "TeraBox returned an empty file list";

  for (const host of hosts) {
    console.log(
      `[TERABOX] Trying ${host.page}`,
    );

    try {
      const page = await getSharePage(
        host.page,
        surl,
        cookies,
      );

      if (!page) {
        console.log(
          `[TERABOX] No jsToken from ${host.page}`,
        );

        continue;
      }

      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(
          `[TERABOX] Share request attempt ${attempt}/3`,
        );

        try {
          const result =
            await requestShareList(
              host.api,
              page.jsToken,
              page.shortUrl,
              cookies,
            );

          const normalized =
            normalizeResponse(result);

          if (
            normalized &&
            Array.isArray(normalized.list) &&
            normalized.list.length > 0
          ) {
            console.log(
              `[TERABOX] SUCCESS via ${host.api}`,
            );

            return normalized;
          }

          if (normalized?.errno !== undefined) {
            lastError =
              `TeraBox errno: ${normalized.errno}`;

            console.log(
              "[TERABOX] errno:",
              normalized.errno,
            );
          }

          if (normalized?.errmsg) {
            lastError = normalized.errmsg;
          }

          if (
            normalized?.message
          ) {
            lastError =
              normalized.message;
          }

          console.log(
            "[TERABOX] Empty file list",
          );
        } catch (error: any) {
          lastError =
            error?.message ||
            String(error);

          console.log(
            "[TERABOX] API attempt error:",
            lastError,
          );
        }

        if (attempt < 3) {
          await sleep(700);
        }
      }
    } catch (error: any) {
      lastError =
        error?.message ||
        String(error);

      console.log(
        `[TERABOX] Host failed ${host.page}:`,
        lastError,
      );
    }
  }

  console.log(
    "[TERABOX] FINAL ERROR:",
    lastError,
  );

  return {
    error: lastError,
    list: [],
  };
}
