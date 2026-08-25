import { loadCookies } from "./utils";

type CookieMap = Record<string, string>;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/145.0.0.0 Safari/537.36";

const APP_ID = "250528";

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
      cookies = { ...loaded };
    }
  } catch (error) {
    console.log("[TERABOX] Cookie loader warning:", error);
  }

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
    .filter(
      ([_, value]) =>
        value !== undefined &&
        value !== null &&
        value !== "",
    )
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

// ------------------------------------------------------
// URL PARSER
// ------------------------------------------------------

function extractSurl(input: string): string {
  const value = input.trim();

  try {
    const url = new URL(value);

    const querySurl =
      url.searchParams.get("surl");

    if (querySurl) {
      return querySurl;
    }

    const match = url.pathname.match(
      /\/s\/([^/?#]+)/i,
    );

    if (match?.[1]) {
      return match[1];
    }
  } catch {
    // Not a full URL.
  }

  return value
    .replace(/^https?:\/\/[^/]+\/s\//i, "")
    .replace(/^\/s\//i, "")
    .trim();
}

function buildShortUrlVariants(input: string) {
  const clean = extractSurl(input);

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
// JS TOKEN
// ------------------------------------------------------

function extractJsToken(
  html: string,
): string | null {
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
// SHARE PAGE
// ------------------------------------------------------

async function getSharePage(
  host: string,
  input: string,
  cookies: CookieMap,
) {
  const variants =
    buildShortUrlVariants(input);

  for (const shortUrl of variants) {
    const pageUrl =
      `https://${host}/sharing/link?surl=` +
      encodeURIComponent(shortUrl);

    console.log(
      "[TERABOX] Fetching page:",
      pageUrl,
    );

    try {
      const response = await fetch(
        pageUrl,
        {
          method: "GET",
          headers: {
            "User-Agent": USER_AGENT,
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language":
              "en-US,en;q=0.9",
            Cookie: cookieHeader(cookies),
            Referer:
              `https://${host}/`,
          },
          redirect: "follow",
        },
      );

      console.log(
        "[TERABOX] Page status:",
        response.status,
      );

      if (!response.ok) {
        continue;
      }

      const text =
        await response.text();

      const jsToken =
        extractJsToken(text);

      if (jsToken) {
        console.log(
          "[TERABOX] jsToken extracted",
        );

        return {
          jsToken,
          shortUrl,
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
  host: string,
  jsToken: string,
  shortUrl: string,
  cookies: CookieMap,
) {
  const apiUrl =
    new URL(
      `https://${host}/share/list`,
    );

  apiUrl.searchParams.set(
    "app_id",
    APP_ID,
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

  console.log(
    "[TERABOX] Share API:",
    apiUrl.toString(),
  );

  const response =
    await fetch(
      apiUrl.toString(),
      {
        method: "GET",
        headers: {
          Host: host,
          "User-Agent":
            USER_AGENT,
          Accept:
            "application/json, text/plain, */*",
          "Accept-Language":
            "en-US,en;q=0.9",
          "X-Requested-With":
            "XMLHttpRequest",
          Referer:
            `https://${host}/sharing/link?surl=${encodeURIComponent(shortUrl)}&clearCache=1`,
          Origin:
            `https://${host}`,
          Cookie:
            cookieHeader(cookies),
        },
      },
    );

  console.log(
    "[TERABOX] Share API status:",
    response.status,
  );

  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    console.log(
      "[TERABOX] Invalid JSON:",
      text.slice(0, 500),
    );

    return null;
  }
}

// ------------------------------------------------------
// DOWNLOAD LINK
// ------------------------------------------------------

async function requestDownloadLink(
  host: string,
  jsToken: string,
  file: any,
  shareData: any,
  cookies: CookieMap,
) {
  const fid =
    file?.fs_id ??
    file?.fid ??
    file?.fsid;

  if (
    fid === undefined ||
    fid === null
  ) {
    return null;
  }

  const shareId =
    shareData?.shareid ??
    shareData?.share_id ??
    shareData?.shareId ??
    file?.shareid ??
    file?.share_id;

  const uk =
    shareData?.uk ??
    shareData?.share_uk ??
    file?.uk;

  const sign =
    shareData?.sign ??
    file?.sign;

  const timestamp =
    shareData?.timestamp ??
    file?.timestamp ??
    Math.floor(
      Date.now() / 1000,
    );

  if (
    shareId === undefined ||
    uk === undefined
  ) {
    console.log(
      "[TERABOX] Download metadata missing:",
      {
        fid,
        shareId,
        uk,
        sign,
        timestamp,
      },
    );

    return null;
  }

  const downloadUrl =
    new URL(
      `https://${host}/share/download`,
    );

  downloadUrl.searchParams.set(
    "app_id",
    APP_ID,
  );

  downloadUrl.searchParams.set(
    "web",
    "1",
  );

  downloadUrl.searchParams.set(
    "channel",
    "dubox",
  );

  downloadUrl.searchParams.set(
    "clienttype",
    "0",
  );

  downloadUrl.searchParams.set(
    "jsToken",
    jsToken,
  );

  downloadUrl.searchParams.set(
    "shareid",
    String(shareId),
  );

  if (sign) {
    downloadUrl.searchParams.set(
      "sign",
      String(sign),
    );
  }

  downloadUrl.searchParams.set(
    "timestamp",
    String(timestamp),
  );

  console.log(
    "[TERABOX] Requesting download link:",
    downloadUrl.toString(),
  );

  const body =
    new URLSearchParams();

  body.set(
    "product",
    "share",
  );

  body.set(
    "nozip",
    "0",
  );

  body.set(
    "fid_list",
    JSON.stringify([
      Number(fid),
    ]),
  );

  body.set(
    "uk",
    String(uk),
  );

  body.set(
    "primaryid",
    String(shareId),
  );

  try {
    const response =
      await fetch(
        downloadUrl.toString(),
        {
          method: "POST",
          headers: {
            Host: host,
            "User-Agent":
              USER_AGENT,
            Accept:
              "application/json, text/plain, */*",
            "Accept-Language":
              "en-US,en;q=0.9",
            "Content-Type":
              "application/x-www-form-urlencoded",
            "X-Requested-With":
              "XMLHttpRequest",
            Referer:
              `https://${host}/sharing/link?surl=${encodeURIComponent(
                shareData?.shorturl ||
                  shareData?.shortUrl ||
                  "",
              )}`,
            Origin:
              `https://${host}`,
            Cookie:
              cookieHeader(cookies),
          },
          body:
            body.toString(),
        },
      );

    console.log(
      "[TERABOX] Download API status:",
      response.status,
    );

    const text =
      await response.text();

    if (!text) {
      return null;
    }

    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      console.log(
        "[TERABOX] Download API invalid JSON:",
        text.slice(0, 500),
      );

      return null;
    }

    console.log(
      "[TERABOX] Download API errno:",
      data?.errno,
    );

    if (
      data?.errno !== undefined &&
      Number(data.errno) !== 0
    ) {
      console.log(
        "[TERABOX] Download API error:",
        data,
      );

      return null;
    }

    const dlink =
      data?.dlink ||
      data?.data?.dlink ||
      data?.list?.[0]?.dlink ||
      data?.data?.list?.[0]?.dlink;

    if (dlink) {
      return dlink;
    }

    return null;
  } catch (error) {
    console.log(
      "[TERABOX] Download request failed:",
      error,
    );

    return null;
  }
}

// ------------------------------------------------------
// NORMALIZE
// ------------------------------------------------------

function normalizeResponse(
  data: any,
) {
  if (!data) {
    return null;
  }

  if (
    Array.isArray(data.list)
  ) {
    return data;
  }

  if (
    data.data &&
    Array.isArray(
      data.data.list,
    )
  ) {
    return {
      ...data,
      list:
        data.data.list,
    };
  }

  if (
    data.data?.list &&
    typeof data.data.list ===
      "object"
  ) {
    const list =
      Object.values(
        data.data.list,
      );

    return {
      ...data,
      list,
    };
  }

  return data;
}

// ------------------------------------------------------
// MAIN
// ------------------------------------------------------

export async function tera(
  input: string,
): Promise<any> {
  console.log(
    "[TERABOX] =================================",
  );

  console.log(
    "[TERABOX] Starting extraction:",
    input,
  );

  if (
    !input ||
    typeof input !== "string"
  ) {
    return {
      error:
        "Invalid TeraBox URL",
      list: [],
    };
  }

  const cookies =
    getCookies();

  console.log(
    "[TERABOX] Cookies loaded:",
    Object.keys(cookies),
  );

  const hosts = [
    {
      page: "dm.terabox.app",
      api: "dm.terabox.app",
    },
    {
      page: "www.terabox.com",
      api: "www.terabox.com",
    },
    {
      page: "www.1024tera.com",
      api: "www.1024tera.com",
    },
  ];

  let lastError =
    "TeraBox returned an empty file list";

  for (
    const host of hosts
  ) {
    console.log(
      `[TERABOX] Trying ${host.page}`,
    );

    try {
      const page =
        await getSharePage(
          host.page,
          input,
          cookies,
        );

      if (!page) {
        console.log(
          `[TERABOX] No jsToken from ${host.page}`,
        );

        continue;
      }

      for (
        let attempt = 1;
        attempt <= 3;
        attempt++
      ) {
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
            normalizeResponse(
              result,
            );

          if (
            !normalized
          ) {
            lastError =
              "Empty TeraBox API response";

            continue;
          }

          const files =
            Array.isArray(
              normalized.list,
            )
              ? normalized.list
              : [];

          console.log(
            "[TERABOX] Files found:",
            files.length,
          );

          if (
            files.length === 0
          ) {
            lastError =
              normalized?.errmsg ||
              normalized?.message ||
              `TeraBox errno: ${
                normalized?.errno ??
                "unknown"
              }`;

            continue;
          }

          // --------------------------------------------
          // DIRECT DLINK ALREADY AVAILABLE
          // --------------------------------------------

          const directFiles =
            files.map(
              (file: any) => ({
                ...file,
                download:
                  file?.download ||
                  file?.dlink ||
                  null,
              }),
            );

          let allHaveLinks =
            directFiles.every(
              (file: any) =>
                !!file.download,
            );

          // --------------------------------------------
          // GENERATE DLINK WHEN dlink IS NULL
          // --------------------------------------------

          if (!allHaveLinks) {
            console.log(
              "[TERABOX] dlink missing. Generating download link...",
            );

            for (
              const file of directFiles
            ) {
              if (
                file.download
              ) {
                continue;
              }

              const dlink =
                await requestDownloadLink(
                  host.api,
                  page.jsToken,
                  file,
                  {
                    ...normalized,
                    shorturl:
                      page.shortUrl,
                    shortUrl:
                      page.shortUrl,
                  },
                  cookies,
                );

              if (dlink) {
                file.download =
                  dlink;

                file.dlink =
                  dlink;

                console.log(
                  "[TERABOX] Download link generated successfully",
                );
              } else {
                console.log(
                  "[TERABOX] Could not generate dlink for:",
                  file?.server_filename ||
                    file?.filename ||
                    file?.name,
                );
              }
            }
          }

          // --------------------------------------------
          // FINAL RESPONSE
          // --------------------------------------------

          const finalFiles =
            directFiles.map(
              (file: any) => ({
                ...file,

                filename:
                  file?.filename ||
                  file?.server_filename ||
                  file?.name ||
                  "TeraBox File",

                size:
                  file?.size ??
                  0,

                fs_id:
                  file?.fs_id ??
                  file?.fid ??
                  null,

                download:
                  file?.download ||
                  file?.dlink ||
                  null,

                dlink:
                  file?.dlink ||
                  file?.download ||
                  null,
              }),
            );

          const hasAnyDownload =
            finalFiles.some(
              (file: any) =>
                !!file.download,
            );

          if (
            hasAnyDownload
          ) {
            console.log(
              "[TERABOX] =================================",
            );

            console.log(
              "[TERABOX] FINAL SUCCESS",
            );

            console.log(
              "[TERABOX] Files:",
              finalFiles.length,
            );

            console.log(
              "[TERABOX] =================================",
            );

            return {
              ...normalized,
              list:
                finalFiles,
              files:
                finalFiles,
              status:
                "success",
              url: input,
              surl:
                page.shortUrl,
            };
          }

          // File exists but TeraBox did not
          // provide a downloadable link.
          lastError =
            "TeraBox found the file, but did not return a download link.";

          console.log(
            "[TERABOX]",
            lastError,
          );
        } catch (
          error: any
        ) {
          lastError =
            error?.message ||
            String(error);

          console.log(
            "[TERABOX] API attempt error:",
            lastError,
          );
        }

        if (
          attempt < 3
        ) {
          await sleep(800);
        }
      }
    } catch (
      error: any
    ) {
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
    status: "error",
    error: lastError,
    message: lastError,
    list: [],
    files: [],
  };
}
