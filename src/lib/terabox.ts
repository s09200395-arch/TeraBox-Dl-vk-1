import {
  loadCookies,
  normalizeSurl,
} from "./utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

function extractJsToken(html: string): string | null {
  const patterns = [
    /fn%28%22(.*?)%22%29/,
    /fn\(["']([^"']+)["']\)/,
    /jsToken\s*[:=]\s*["']([^"']+)["']/i,
    /["']jsToken["']\s*[:=]\s*["']([^"']+)["']/i,
    /window\.jsToken\s*=\s*["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function makeCookieHeader(
  cookies: Record<string, string>,
): string {
  return Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

export async function tera(
  surl: string,
): Promise<any> {
  try {
    const { surlParam, shortUrl } =
      normalizeSurl(surl);

    console.log(
      "[TERABOX] surlParam:",
      surlParam,
    );

    console.log(
      "[TERABOX] shortUrl:",
      shortUrl,
    );

    const cookies = loadCookies();

    const cookieHeader =
      makeCookieHeader(cookies);

    const pageUrl =
      `https://dm.terabox.app/sharing/link?surl=${encodeURIComponent(
        surlParam,
      )}`;

    const pageResponse = await fetch(
      pageUrl,
      {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language":
            "en-US,en;q=0.9",
          ...(cookieHeader
            ? { Cookie: cookieHeader }
            : {}),
        },
      },
    );

    console.log(
      "[TERABOX] page status:",
      pageResponse.status,
    );

    const html =
      await pageResponse.text();

    if (!pageResponse.ok) {
      return {
        error:
          `TeraBox page returned HTTP ${pageResponse.status}`,
      };
    }

    const jsToken =
      extractJsToken(html);

    if (!jsToken) {
      return {
        error:
          "Could not extract jsToken from TeraBox share page. TeraBox verification may be blocking the request.",
      };
    }

    console.log(
      "[TERABOX] jsToken extracted",
    );

    const apiUrl =
      new URL(
        "https://dm.terabox.app/share/list",
      );

    apiUrl.searchParams.set(
      "app_id",
      "250528",
    );

    apiUrl.searchParams.set(
      "jsToken",
      jsToken,
    );

    apiUrl.searchParams.set(
      "site_referer",
      "https://www.terabox.app/",
    );

    apiUrl.searchParams.set(
      "shorturl",
      shortUrl,
    );

    apiUrl.searchParams.set(
      "root",
      "1",
    );

    const apiResponse = await fetch(
      apiUrl.toString(),
      {
        method: "GET",
        headers: {
          Host: "dm.terabox.app",
          "User-Agent": USER_AGENT,
          Accept:
            "application/json, text/plain, */*",
          "Accept-Language":
            "en-US,en;q=0.9",
          "X-Requested-With":
            "XMLHttpRequest",
          Referer: pageUrl,
          Origin:
            "https://dm.terabox.app",
          ...(cookieHeader
            ? { Cookie: cookieHeader }
            : {}),
        },
      },
    );

    console.log(
      "[TERABOX] API status:",
      apiResponse.status,
    );

    const responseText =
      await apiResponse.text();

    if (!apiResponse.ok) {
      return {
        error:
          `TeraBox API returned HTTP ${apiResponse.status}`,
        raw:
          responseText.substring(0, 500),
      };
    }

    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      return {
        error:
          "TeraBox returned an invalid JSON response.",
        raw:
          responseText.substring(0, 500),
      };
    }

    console.log(
      "[TERABOX] API errno:",
      data?.errno,
    );

    if (
      data?.errno !== undefined &&
      Number(data.errno) !== 0
    ) {
      return {
        ...data,
        error:
          data.errmsg ||
          data.message ||
          `TeraBox errno ${data.errno}`,
      };
    }

    return data;
  } catch (error: any) {
    console.error(
      "[TERABOX] Exception:",
      error,
    );

    return {
      error:
        error?.message ||
        String(error),
    };
  }
}
