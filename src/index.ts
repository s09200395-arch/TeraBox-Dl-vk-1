import { Bot, InputFile } from "grammy";

const BOT_TOKEN = process.env.BOT_TOKEN;

const API_BASE =
  process.env.TERABOX_API_URL ||
  "https://terabox-dl-vk-1-production.up.railway.app";

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is missing");
}

const bot = new Bot(BOT_TOKEN);

function isTeraboxUrl(text: string): boolean {
  try {
    const u = new URL(text.trim());

    const hosts = [
      "terabox.app",
      "www.terabox.app",
      "terabox.com",
      "www.terabox.com",
      "teraboxshare.com",
      "www.teraboxshare.com",
      "teraboxlink.com",
      "www.teraboxlink.com",
      "1024terabox.com",
      "www.1024terabox.com",
      "dm.terabox.app",
      "terasharefile.com",
      "www.terasharefile.com",
    ];

    return hosts.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);

  if (!match) return null;

  return match[0].trim().replace(/[)\]}>,.]+$/, "");
}

function cleanFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

async function callTeraBoxAPI(targetUrl: string): Promise<any> {
  const endpoint =
    `${API_BASE}/api?url=` + encodeURIComponent(targetUrl);

  console.log("[API] Request:", endpoint);

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });

  const raw = await response.text();

  console.log("[API] HTTP:", response.status);
  console.log("[API] Response:", raw.slice(0, 1000));

  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `API returned invalid JSON (HTTP ${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `API HTTP ${response.status}`
    );
  }

  if (data?.status !== "success") {
    throw new Error(
      data?.message ||
        data?.error ||
        "TeraBox extraction failed"
    );
  }

  if (!data?.download) {
    throw new Error("API returned no download link");
  }

  return data;
}

async function sendDownloadedFile(
  chatId: number,
  data: any
) {
  const downloadUrl = String(data.download);
  const filename = cleanFileName(
    data.filename || "terabox_file"
  );

  const size = data.size ? String(data.size) : "";
  const responseTime = data.response_time
    ? String(data.response_time)
    : "";

  /*
   * First try Telegram's remote URL handling.
   * This avoids downloading the entire file onto Railway.
   */
  try {
    await bot.api.sendDocument(
      chatId,
      {
        url: downloadUrl,
      },
      {
        caption:
          `✅ <b>Download completed</b>\n\n` +
          `📁 <b>${escapeHtml(filename)}</b>` +
          (size ? `\n📦 Size: ${escapeHtml(size)}` : "") +
          (responseTime
            ? `\n⚡ ${escapeHtml(responseTime)}`
            : ""),
        parse_mode: "HTML",
      }
    );

    return;
  } catch (remoteError) {
    console.log(
      "[TELEGRAM] Remote URL failed:",
      remoteError
    );
  }

  /*
   * Fallback:
   * Download file through Railway and upload it to Telegram.
   */
  const fileResponse = await fetch(downloadUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!fileResponse.ok) {
    throw new Error(
      `Download URL returned HTTP ${fileResponse.status}`
    );
  }

  const buffer = await fileResponse.arrayBuffer();

  const file = new InputFile(
    new Uint8Array(buffer),
    filename
  );

  await bot.api.sendDocument(
    chatId,
    file,
    {
      caption:
        `✅ <b>Download completed</b>\n\n` +
        `📁 <b>${escapeHtml(filename)}</b>` +
        (size ? `\n📦 Size: ${escapeHtml(size)}` : ""),
      parse_mode: "HTML",
    }
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* =========================
   START
========================= */

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 <b>Welcome!</b>\n\n" +
      "🚀 Send me any TeraBox share link.\n" +
      "I will extract the file and send it here.",
    {
      parse_mode: "HTML",
    }
  );
});

/* =========================
   HELP
========================= */

bot.command("help", async (ctx) => {
  await ctx.reply(
    "📥 <b>How to use</b>\n\n" +
      "1️⃣ Copy a TeraBox share link\n" +
      "2️⃣ Send it here\n" +
      "3️⃣ Wait for the download\n\n" +
      "⚡ Powered by TeraBox Downloader API",
    {
      parse_mode: "HTML",
    }
  );
});

/* =========================
   TEXT HANDLER
========================= */

bot.on("message:text", async (ctx) => {
  const message = ctx.message.text.trim();

  if (message.startsWith("/")) {
    return;
  }

  const targetUrl = extractUrl(message);

  if (!targetUrl || !isTeraboxUrl(targetUrl)) {
    await ctx.reply(
      "❌ <b>Invalid TeraBox link</b>\n\n" +
        "Please send a valid TeraBox share URL.",
      {
        parse_mode: "HTML",
      }
    );

    return;
  }

  const statusMessage = await ctx.reply(
    "⏳ <b>Processing your TeraBox link...</b>\n\n" +
      "🔍 Extracting file information...",
    {
      parse_mode: "HTML",
    }
  );

  try {
    const data = await callTeraBoxAPI(targetUrl);

    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      "📥 <b>File found!</b>\n\n" +
        `📁 ${escapeHtml(
          data.filename || "Unknown file"
        )}\n` +
        (data.size
          ? `📦 ${escapeHtml(String(data.size))}\n`
          : "") +
        "\n⬆️ Sending to Telegram...",
      {
        parse_mode: "HTML",
      }
    );

    await sendDownloadedFile(ctx.chat.id, data);

    try {
      await ctx.api.deleteMessage(
        ctx.chat.id,
        statusMessage.message_id
      );
    } catch {}
  } catch (error: any) {
    console.error("[BOT ERROR]", error);

    const errorText =
      error?.message || String(error);

    try {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMessage.message_id,
        "❌ <b>Download failed</b>\n\n" +
          `<code>${escapeHtml(errorText)}</code>`,
        {
          parse_mode: "HTML",
        }
      );
    } catch {
      await ctx.reply(
        "❌ <b>Download failed</b>\n\n" +
          `<code>${escapeHtml(errorText)}</code>`,
        {
          parse_mode: "HTML",
        }
      );
    }
  }
});

/* =========================
   ERROR HANDLER
========================= */

bot.catch((err) => {
  console.error("[GRAMMY ERROR]", err.error);
});

/* =========================
   START BOT
========================= */

console.log("🚀 Starting TeraBox Telegram Bot...");
console.log("🔗 API:", API_BASE);

bot.start({
  onStart: (botInfo) => {
    console.log(
      `✅ Bot started: @${botInfo.username}`
    );
  },
});
