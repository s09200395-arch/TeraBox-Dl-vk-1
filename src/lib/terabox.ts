import { loadCookies } from "./utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

const APP_ID = "250528";

function buildCookieString(cookies: Record<string, string>) {
  return Object.entries(cookies)
    .filter(([_, value]) => value && value !== "undefined")
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
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

function extractDpLogId(text: string): string | null {
  const patterns = [
    /dp-logid[=\\"']+(\d+)/i,
    /"dp-logid"\s*:\s*"?(\d+)"?/i,
    /dpLogId["']?\s*[:=]\s*["']?(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function normalizeSurl(surl: string) {
  let value = surl.trim();

  if (value.startsWith("1")) {
    return {
      shorturl: value.substring(1),
      original: value,
    };
  }

  return {
    shorturl: value,
    original: `1${value}`,
  };
}

async function safeJson(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      errno: -999,
      errmsg: "Invalid JSON response",
      raw: text.substring(0, 1000),
    };
  }
}

async function resolveRedirect(
  url: string,
  cookieString: string,
): Promise<string> {
  if (!url) return "";

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        ...(cookieString ? { Cookie: cookieString } : {}),
      },
    });

    const location = response.headers.get("location");

    if (location) {
      return location;
    }

    if (response.status >= 200 && response.status < 300) {
      return url;
    }

    return url;
  } catch {
    return url;
  }
}

async function getDownloadLink(
  file: any,
  shareData: any,
  jsToken: string,
  dpLogId: string,
  cookieString: string,
) {
  const fid =
    file?.fs_id ??
    file?.fid ??
    file?.fsid ??
    file?.id;

  const shareid =
    shareData?.shareid ??
    shareData?.share_id ??
    shareData?.shareId;

  const uk = shareData?.uk;

  const sign = shareData?.sign;

  const timestamp =
    shareData?.timestamp ??
    Math.floor(Date.now() / 1000).toString();

  if (!fid) {
    throw new Error("Missing file fs_id");
  }

  if (!shareid) {
    throw new Error("Missing shareid");
  }

  if (!uk) {
    throw new Error("Missing uk");
  }

  if (!sign) {
    throw new Error("Missing sign");
  }

  console.log("[TERABOX] Download parameters:", {
    fid,
    shareid,
    uk,
    timestamp,
    hasSign: Boolean(sign),
    hasJsToken: Boolean(jsToken),
  });

  const params = new URLSearchParams({
    app_id: APP_ID,
    web: "1",
    channel: "dubox",
    clienttype: "0",
    jsToken,
    "dp-logid": dpLogId,
    shareid: String(shareid),
    sign: String(sign),
    timestamp: String(timestamp),
  });

  const body = new URLSearchParams({
    product: "share",
    nozip: "0",
    fid_list: JSON.stringify([String(fid)]),
    uk: String(uk),
    primaryid: String(shareid),
  });

  const endpoints = [
    `https://www.terabox.com/share/download?${params.toString()}`,
    `https://dm.terabox.app/share/download?${params.toString()}`,
  ];

  let lastError = "";

  for (const endpoint of endpoints) {
    try {
      console.log("[TERABOX] Trying download endpoint:", endpoint);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Content-Type":
            "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Origin: "https://www.terabox.com",
          Referer: "https://www.terabox.com/",
          ...(cookieString ? { Cookie: cookieString } : {}),
        },
        body: body.toString(),
      });

      console.log(
        "[TERABOX] Download API status:",
        response.status,
      );

      const data = await safeJson(response);

      console.log(
        "[TERABOX] Download API response:",
        JSON.stringify(data).substring(0, 1000),
      );

      if (data?.errno && Number(data.errno) !== 0) {
        lastError = `Download API errno ${data.errno}`;
        continue;
      }

      let dlink =
        data?.dlink ??
        data?.download ??
        data?.download_url ??
        data?.url;

      if (!dlink && Array.isArray(data?.list)) {
        dlink =
          data.list[0]?.dlink ??
          data.list[0]?.download ??
          data.list[0]?.url;
      }

      if (!dlink && Array.isArray(data?.data)) {
        dlink =
          data.data[0]?.dlink ??
          data.data[0]?.download ??
          data.data[0]?.url;
      }

      if (typeof dlink === "string" && dlink.length > 0) {
        console.log("[TERABOX] dlink received");

        const finalUrl = await resolveRedirect(
          dlink,
          cookieString,
        );

        return finalUrl || dlink;
      }

      lastError = "Download API returned no dlink";
    } catch (error: any) {
      console.error(
        "[TERABOX] Download endpoint failed:",
        error,
      );

      lastError = String(error);
    }
  }

  throw new Error(
    lastError || "TeraBox returned no download link",
  );
}

export async function tera(surl: string): Promise<any> {
  try {
    console.log("[TERABOX] Starting extraction");
    console.log("[TERABOX] Input surl:", surl);

    const cookies = loadCookies() || {};
    const cookieString = buildCookieString(cookies);

    console.log(
      "[TERABOX] Cookies loaded:",
      Object.keys(cookies),
    );

    const normalized = normalizeSurl(surl);

    const shorturl = normalized.shorturl;

    console.log("[TERABOX] shorturl:", shorturl);

    /*
     * ---------------------------------------------------------
     * STEP 1: Fetch sharing page
     * ---------------------------------------------------------
     */

    const pageUrl =
      `https://dm.terabox.app/sharing/link?surl=${encodeURIComponent(
        shorturl,
      )}`;

    console.log("[TERABOX] Fetching page:", pageUrl);

    const pageResponse = await fetch(pageUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(cookieString ? { Cookie: cookieString } : {}),
      },
    });

    console.log(
      "[TERABOX] Page status:",
      pageResponse.status,
    );

    if (!pageResponse.ok) {
      return {
        error: `TeraBox sharing page HTTP ${pageResponse.status}`,
      };
    }

    const html = await pageResponse.text();

    /*
     * ---------------------------------------------------------
     * STEP 2: Extract jsToken
     * ---------------------------------------------------------
     */

    const jsToken = extractJsToken(html);

    if (!jsToken) {
      console.error(
        "[TERABOX] jsToken not found",
      );

      return {
        error:
          "Failed to extract jsToken from TeraBox page",
      };
    }

    console.log("[TERABOX] jsToken extracted");

    /*
     * ---------------------------------------------------------
     * STEP 3: Extract dp-logid
     * ---------------------------------------------------------
     */

    const extractedDpLogId =
      extractDpLogId(html);

    const dpLogId =
      extractedDpLogId ||
      Date.now().toString();

    console.log(
      "[TERABOX] dp-logid:",
      dpLogId,
    );

    /*
     * ---------------------------------------------------------
     * STEP 4: Share list
     * ---------------------------------------------------------
     */

    const listUrl = new URL(
      "https://dm.terabox.app/share/list",
    );

    listUrl.searchParams.set(
      "app_id",
      APP_ID,
    );

    listUrl.searchParams.set(
      "web",
      "1",
    );

    listUrl.searchParams.set(
      "channel",
      "0",
    );

    listUrl.searchParams.set(
      "clienttype",
      "0",
    );

    listUrl.searchParams.set(
      "jsToken",
      jsToken,
    );

    listUrl.searchParams.set(
      "dp-logid",
      dpLogId,
    );

    listUrl.searchParams.set(
      "page",
      "1",
    );

    listUrl.searchParams.set(
      "num",
      "20",
    );

    listUrl.searchParams.set(
      "by",
      "name",
    );

    listUrl.searchParams.set(
      "order",
      "asc",
    );

    listUrl.searchParams.set(
      "site_referer",
      "https://www.terabox.com/",
    );

    listUrl.searchParams.set(
      "shorturl",
      shorturl,
    );

    listUrl.searchParams.set(
      "root",
      "1",
    );

    console.log(
      "[TERABOX] Fetching share list",
    );

    const listResponse = await fetch(
      listUrl.toString(),
      {
        headers: {
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
          ...(cookieString
            ? { Cookie: cookieString }
            : {}),
        },
      },
    );

    console.log(
      "[TERABOX] Share API status:",
      listResponse.status,
    );

    const data = await safeJson(
      listResponse,
    );

    console.log(
      "[TERABOX] Share API errno:",
      data?.errno,
    );

    if (
      data?.errno !== undefined &&
      Number(data.errno) !== 0
    ) {
      return {
        error:
          data?.errmsg ||
          data?.message ||
          `TeraBox API errno ${data.errno}`,
      };
    }

    if (
      !Array.isArray(data?.list) ||
      data.list.length === 0
    ) {
      return {
        error:
          "TeraBox returned an empty file list",
      };
    }

    /*
     * ---------------------------------------------------------
     * STEP 5: File information
     * ---------------------------------------------------------
     */

    const files = data.list;

    console.log(
      "[TERABOX] Files found:",
      files.length,
    );

    const resultFiles = [];

    /*
     * ---------------------------------------------------------
     * STEP 6: Resolve download links
     * ---------------------------------------------------------
     */

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      console.log(
        `[TERABOX] Resolving file ${i + 1}/${files.length}:`,
        file?.server_filename,
      );

      let dlink =
        file?.dlink ??
        file?.download_url ??
        file?.download;

      if (!dlink) {
        try {
          dlink = await getDownloadLink(
            file,
            data,
            jsToken,
            dpLogId,
            cookieString,
          );
        } catch (error: any) {
          console.error(
            "[TERABOX] Download link failed:",
            error,
          );

          /*
           * Don't crash the complete response.
           * Keep the file metadata and mark dlink as null.
           */
          dlink = null;
        }
      }

      resultFiles.push({
        ...file,
        dlink,
      });
    }

    /*
     * ---------------------------------------------------------
     * STEP 7: Final response
     * ---------------------------------------------------------
     */

    const firstFile = resultFiles[0];

    if (!firstFile?.dlink) {
      console.error(
        "[TERABOX] No download link returned",
      );

      return {
        error:
          "TeraBox returned file information but no download link",
        list: resultFiles,
        shareid: data?.shareid,
        uk: data?.uk,
        sign: data?.sign,
        timestamp: data?.timestamp,
      };
    }

    console.log(
      "[TERABOX] Download link successfully resolved",
    );

    return {
      ...data,
      list: resultFiles,
      success: true,
    };
  } catch (error: any) {
    console.error(
      "[TERABOX] Fatal error:",
      error,
    );

    return {
      error:
        error?.message ||
        String(error),
    };
  }
}
