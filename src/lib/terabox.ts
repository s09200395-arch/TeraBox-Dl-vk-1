import { loadCookies } from "./utils";

function extractShortUrl(value: string): {
  surlParam: string;
  shortUrl: string;
} {
  const input = value.trim();

  let key = input;

  try {
    const parsed = new URL(input);

    const surl = parsed.searchParams.get("surl");

    if (surl) {
      key = surl.trim();
    } else {
      const match = parsed.pathname.match(
        /\/s\/([^/?#]+)/i,
      );

      if (match?.[1]) {
        key = match[1].trim();
      }
    }
  } catch {
    // Input is already treated as a shorturl.
  }

  // TeraBox external links commonly use /s/1XXXX.
  // The leading "1" is not sent as the shorturl.
  const shortUrl = key.startsWith("1")
    ? key.substring(1)
    : key;

  const surlParam = key.startsWith("1")
    ? key
    : `1${key}`;

  return {
    surlParam,
    shortUrl,
  };
}

function extractJsToken(html: string): string | null {
  const patterns = [
    /fn%28%22(.*?)%22%29/,
    /fn\("([^"]+)"\)/,
    /jsToken\s*=\s*["']([^"']+)["']/,
    /jsToken["']?\s*:\s*["']([^"']+)["']/,
    /window\.jsToken\s*=\s*["']([^"']+)["']/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export async function tera(
  surl: string,
): Promise<any> {
  const { surlParam, shortUrl } =
    extractShortUrl(surl);

  console.log("[DEBUG] Input:", surl);
  console.log("[DEBUG] surlParam:", surlParam);
  console.log("[DEBUG] shortUrl:", shortUrl);

  const cookies = loadCookies();

  const ndusCookie = cookies["ndus"];

  const cookieString = ndusCookie
    ? `ndus=${ndusCookie}`
    : "";

  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/145.0.0.0 Safari/537.36";

  const pageHeaders: Record<string, string> = {
    "User-Agent": userAgent,
    Accept:
      "text/html,application/xhtml+xml," +
      "application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };

  if (cookieString) {
    pageHeaders["Cookie"] = cookieString;
  }

  const firstUrl =
    `https://dm.terabox.app/sharing/link` +
    `?surl=${encodeURIComponent(surlParam)}`;

  console.log(
    "[DEBUG] Fetching:",
    firstUrl,
  );

  try {
    const response = await fetch(firstUrl, {
      method: "GET",
      headers: pageHeaders,
      redirect: "follow",
    });

    console.log(
      "[DEBUG] Page status:",
      response.status,
    );

    const html = await response.text();

    console.log(
      "[DEBUG] HTML length:",
      html.length,
    );

    if (!response.ok) {
      return {
        error:
          `TeraBox page returned HTTP ${response.status}`,
      };
    }

    const jsToken = extractJsToken(html);

    if (!jsToken) {
      console.log(
        "[DEBUG] jsToken was not found.",
      );

      return {
        error:
          "Failed to extract jsToken from TeraBox share page.",
      };
    }

    console.log(
      "[DEBUG] jsToken extracted successfully.",
    );

    const apiUrl = new URL(
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

    const apiHeaders: Record<string, string> = {
      "User-Agent": userAgent,
      Accept:
        "application/json, text/plain, */*",
      "Accept-Language":
        "en-US,en;q=0.9",
      "X-Requested-With":
        "XMLHttpRequest",
      Referer: firstUrl,
      Origin:
        "https://dm.terabox.app",
    };

    if (cookieString) {
      apiHeaders["Cookie"] =
        cookieString;
    }

    console.log(
      "[DEBUG] Calling share/list...",
    );

    const apiResponse = await fetch(
      apiUrl.toString(),
      {
        method: "GET",
        headers: apiHeaders,
        redirect: "follow",
      },
    );

    console.log(
      "[DEBUG] share/list status:",
      apiResponse.status,
    );

    const raw = await apiResponse.text();

    console.log(
      "[DEBUG] API response length:",
      raw.length,
    );

    let data: any;

    try {
      data = JSON.parse(raw);
    } catch {
      return {
        error:
          "TeraBox returned a non-JSON response.",
        http_status:
          apiResponse.status,
      };
    }

    console.log(
      "[DEBUG] API errno:",
      data?.errno,
    );

    if (
      data?.errno !== undefined &&
      data.errno !== 0
    ) {
      return {
        error:
          data?.show_msg ||
          data?.message ||
          `TeraBox API error: ${data.errno}`,
        errno: data.errno,
        data,
      };
    }

    if (
      !data?.list ||
      !Array.isArray(data.list)
    ) {
      return {
        error:
          "TeraBox returned no file list.",
        data,
      };
    }

    return data;
  } catch (error: any) {
    console.error(
      "[DEBUG] tera() error:",
      error,
    );

    return {
      error:
        error?.message ||
        String(error),
    };
  }
}
