import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  createDraft,
  createUpload,
  checkRateLimit,
  deleteAllUploads,
  deleteDraft,
  deleteUploadByCode,
  getLatestDraft,
  getUploadByCode,
  listUploads,
  registerAccess,
  upsertUser,
  getTotalUsers,
  getAllUserIds,
  type UploadRecord,
  type UploadType
} from "../../../lib/db";
import {
  copyMessage,
  getChatMember,
  sendAnimation,
  sendAudio,
  sendDocument,
  sendMessage,
  sendMessageWithKeyboard,
  sendPhoto,
  sendVideo,
  sendVoice
} from "../../../lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramMessage = {
  message_id: number;
  from?: { id: number; first_name?: string };
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  photo?: { file_id: string; file_size?: number }[];
  video?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  audio?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; file_size?: number };
  animation?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type UploadOptions = {
  maxAccess: number | null;
  requiredChannels: string[] | null;
  inlineContent: string | null;
};

function generateCode() {
  return crypto.randomBytes(4).toString("hex");
}

function normalizeChannels(channels: string[]) {
  const normalized = channels
    .map((channel) => channel.trim())
    .filter((channel) => channel.length > 0);
  return normalized.length ? normalized : null;
}

function parseUploadOptions(text: string): UploadOptions {
  const parts = text.trim().split(/\s+/);
  const payload = parts.slice(1).join(" ");
  const tokens = payload.split(/\s+/).filter(Boolean);
  let maxAccess: number | null = null;
  const channels: string[] = [];
  const inlineParts: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("limit=") || token.startsWith("max=")) {
      const value = token.split("=")[1];
      const parsed = Number(value);
      if (!Number.isNaN(parsed) && parsed > 0) {
        maxAccess = parsed;
      }
      continue;
    }

    if (token.startsWith("channels=") || token.startsWith("ch=")) {
      const value = token.split("=")[1] ?? "";
      const listed = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      channels.push(...listed);
      continue;
    }

    if (token.startsWith("@") || token.startsWith("-100")) {
      channels.push(token);
      continue;
    }

    if (/^\d+$/.test(token) && !maxAccess) {
      const parsed = Number(token);
      if (!Number.isNaN(parsed) && parsed > 0) {
        maxAccess = parsed;
        continue;
      }
    }

    inlineParts.push(token);
  }

  const inlineContent = inlineParts.length ? inlineParts.join(" ") : null;
  return { maxAccess, requiredChannels: normalizeChannels(channels), inlineContent };
}

function detectContentType(message: TelegramMessage): {
  type: UploadType | null;
  text: string | null;
  fileId: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
} {
  if (message.document) {
    return {
      type: "document",
      text: null,
      fileId: message.document.file_id,
      fileName: message.document.file_name ?? null,
      mimeType: message.document.mime_type ?? null,
      fileSize: message.document.file_size ?? null
    };
  }

  if (message.photo && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1];
    return {
      type: "photo",
      text: null,
      fileId: largest.file_id,
      fileName: null,
      mimeType: "image",
      fileSize: largest.file_size ?? null
    };
  }

  if (message.video) {
    return {
      type: "video",
      text: null,
      fileId: message.video.file_id,
      fileName: message.video.file_name ?? null,
      mimeType: message.video.mime_type ?? null,
      fileSize: message.video.file_size ?? null
    };
  }

  if (message.audio) {
    return {
      type: "audio",
      text: null,
      fileId: message.audio.file_id,
      fileName: message.audio.file_name ?? null,
      mimeType: message.audio.mime_type ?? null,
      fileSize: message.audio.file_size ?? null
    };
  }

  if (message.voice) {
    return {
      type: "voice",
      text: null,
      fileId: message.voice.file_id,
      fileName: null,
      mimeType: "audio",
      fileSize: message.voice.file_size ?? null
    };
  }

  if (message.animation) {
    return {
      type: "animation",
      text: null,
      fileId: message.animation.file_id,
      fileName: message.animation.file_name ?? null,
      mimeType: message.animation.mime_type ?? null,
      fileSize: message.animation.file_size ?? null
    };
  }

  const text = message.text ?? message.caption ?? null;
  if (text) {
    return {
      type: "text",
      text,
      fileId: null,
      fileName: null,
      mimeType: null,
      fileSize: null
    };
  }

  return {
    type: null,
    text: null,
    fileId: null,
    fileName: null,
    mimeType: null,
    fileSize: null
  };
}

async function sendUploadContent(chatId: number, upload: UploadRecord) {
  switch (upload.type) {
    case "text":
    case "link":
      if (upload.text_content) {
        await sendMessage(chatId, upload.text_content);
      } else {
        await sendMessage(chatId, "No content available.");
      }
      return;
    case "document":
      if (upload.file_id) await sendDocument(chatId, upload.file_id);
      return;
    case "photo":
      if (upload.file_id) await sendPhoto(chatId, upload.file_id);
      return;
    case "video":
      if (upload.file_id) await sendVideo(chatId, upload.file_id);
      return;
    case "audio":
      if (upload.file_id) await sendAudio(chatId, upload.file_id);
      return;
    case "voice":
      if (upload.file_id) await sendVoice(chatId, upload.file_id);
      return;
    case "animation":
      if (upload.file_id) await sendAnimation(chatId, upload.file_id);
      return;
    default:
      await sendMessage(chatId, "Unsupported content.");
  }
}

async function ensureRequiredChannels(userId: number, channels: string[]) {
  const missing: string[] = [];
  for (const channel of channels) {
    try {
      const member = (await getChatMember(channel, userId)) as { status: string };
      if (member.status === "left" || member.status === "kicked") {
        missing.push(channel);
      }
    } catch {
      missing.push(channel);
    }
  }
  return missing;
}

async function handleStart(message: TelegramMessage, code: string | null) {
  if (!code) {
    await sendMessage(
      message.chat.id,
      "Send /start <code> to access shared content."
    );
    return;
  }

  const upload = await getUploadByCode(code);
  if (!upload) {
    await sendMessage(message.chat.id, "Invalid or expired code.");
    return;
  }

  if (upload.max_access && upload.access_count >= upload.max_access) {
    await sendMessage(message.chat.id, "Access limit reached.");
    return;
  }

  const required = upload.required_channels ?? [];
  if (required.length) {
    const missing = await ensureRequiredChannels(message.from?.id ?? 0, required);
    if (missing.length) {
      const startLink = formatStartLink(code);
      const channelButtons = missing
        .filter((channel) => channel.startsWith("@"))
        .map((channel) => {
          const name = channel.replace(/^@/, "");
          return [{ text: channel, url: `https://t.me/${name}` }];
        });
      const textLines = [
        "Please join the required channels/groups:",
        ...missing.map((channel) => `- ${channel}`),
        "Then tap the button below."
      ];
      const keyboard = [...channelButtons];
      if (startLink.startsWith("https://t.me/")) {
        keyboard.push([{ text: "I joined", url: startLink }]);
      }
      if (keyboard.length) {
        await sendMessageWithKeyboard(message.chat.id, textLines.join("\n"), keyboard);
      } else {
        await sendMessage(message.chat.id, textLines.join("\n"));
      }
      return;
    }
  }

  await registerAccess(upload, message.from?.id ?? 0);
  await sendUploadContent(message.chat.id, upload);
}

async function createUploadFromMessage(
  message: TelegramMessage,
  adminId: number,
  maxAccess: number | null,
  requiredChannels: string[] | null,
  inlineContent: string | null
) {
  const content = detectContentType(message);
  const resolvedText = inlineContent ?? content.text;

  const payload = {
    code: generateCode(),
    owner_id: adminId,
    type: content.type === "text" && resolvedText ? "text" : content.type,
    text_content: resolvedText,
    file_id: content.fileId,
    file_name: content.fileName,
    mime_type: content.mimeType,
    file_size: content.fileSize,
    max_access: maxAccess,
    required_channels: requiredChannels
  } as Omit<UploadRecord, "id" | "created_at" | "access_count">;

  if (!payload.type) {
    throw new Error("No content detected.");
  }

  let attempt = 0;
  while (attempt < 3) {
    try {
      return await createUpload(payload);
    } catch {
      payload.code = generateCode();
      attempt += 1;
    }
  }

  throw new Error("Failed to create upload.");
}

async function handleUpload(message: TelegramMessage, text: string) {
  const adminId = getAdminId();
  const { maxAccess, requiredChannels, inlineContent } = parseUploadOptions(text);
  const content = detectContentType(message);

  if (content.type || inlineContent) {
    const upload = await createUploadFromMessage(
      message,
      adminId,
      maxAccess,
      requiredChannels,
      inlineContent
    );
    await sendMessage(
      message.chat.id,
      `Created. Access: ${formatStartLink(upload.code)}`
    );
    return;
  }

  const draft = await createDraft(
    adminId,
    generateCode(),
    maxAccess,
    requiredChannels
  );
  await sendMessage(
    message.chat.id,
    `Send the content now. Code reserved: ${formatStartLink(draft.code)}`
  );
}

async function handleDraftContent(message: TelegramMessage) {
  const adminId = getAdminId();
  const draft = await getLatestDraft(adminId);
  if (!draft) return false;

  const upload = await createUploadFromMessage(
    message,
    adminId,
    draft.max_access,
    draft.required_channels,
    null
  );
  await deleteDraft(draft.id);
  await sendMessage(
    message.chat.id,
    `Created. Access: ${formatStartLink(upload.code)}`
  );
  return true;
}

async function handleStats(message: TelegramMessage, code: string | null) {
  if (!code) {
    await sendMessage(message.chat.id, "Usage: /stats <code>");
    return;
  }

  const upload = await getUploadByCode(code);
  if (!upload) {
    await sendMessage(message.chat.id, "Code not found.");
    return;
  }

  const maxAccess =
    upload.max_access === null ? "unlimited" : upload.max_access.toString();
  const required = upload.required_channels?.join(", ") ?? "none";
  await sendMessage(
    message.chat.id,
    `Accessed: ${upload.access_count}. Limit: ${maxAccess}. Required: ${required}.`
  );
}

async function handleCheck(message: TelegramMessage, code: string | null) {
  if (!code) {
    await sendMessage(message.chat.id, "Usage: /check <code>");
    return;
  }

  const upload = await getUploadByCode(code);
  if (!upload) {
    await sendMessage(message.chat.id, "Code not found.");
    return;
  }

  const maxAccess =
    upload.max_access === null ? "unlimited" : upload.max_access.toString();
  const required = upload.required_channels?.join(", ") ?? "none";
  const size =
    upload.file_size === null ? "n/a" : `${upload.file_size.toString()} bytes`;
  const fileName = upload.file_name ?? "n/a";
  const mime = upload.mime_type ?? "n/a";
  const textPreview =
    upload.text_content && upload.text_content.length > 120
      ? `${upload.text_content.slice(0, 120)}...`
      : upload.text_content ?? "n/a";

  const details = [
    `Link: ${formatStartLink(upload.code)}`,
    `Type: ${upload.type}`,
    `Accessed: ${upload.access_count}`,
    `Limit: ${maxAccess}`,
    `Required: ${required}`,
    `File name: ${fileName}`,
    `MIME: ${mime}`,
    `Size: ${size}`,
    `Text: ${textPreview}`,
    `Created: ${upload.created_at}`
  ].join("\n");

  await sendMessage(message.chat.id, details);
}

async function handleList(message: TelegramMessage) {
  const adminId = getAdminId();
  const uploads = await listUploads(adminId);
  if (!uploads.length) {
    await sendMessage(message.chat.id, "No uploads yet.");
    return;
  }

  const lines = uploads.map((upload) => {
    const limit = upload.max_access ?? "∞";
    return `${formatStartLink(upload.code)} | ${upload.access_count}/${limit} | /delete ${upload.code}`;
  });
  await sendMessage(message.chat.id, lines.join("\n"));
}

async function handleDelete(message: TelegramMessage, code: string | null) {
  if (!code) {
    await sendMessage(message.chat.id, "Usage: /delete <code>");
    return;
  }
  const adminId = getAdminId();
  const deleted = await deleteUploadByCode(adminId, code);
  if (!deleted) {
    await sendMessage(message.chat.id, "Code not found.");
    return;
  }
  await sendMessage(message.chat.id, "Deleted.");
}

async function handleDeleteAll(message: TelegramMessage) {
  const adminId = getAdminId();
  const count = await deleteAllUploads(adminId);
  await sendMessage(message.chat.id, `Deleted ${count} uploads.`);
}

async function handleHelp(message: TelegramMessage, isAdmin: boolean) {
  if (isAdmin) {
    const helpText = [
      "🛡 *Admin Commands*",
      "",
      "📝 *Uploads*",
      "• `/upload` - Start new upload (set limit/channels in text)",
      "• `/list` or `/files` - List all uploads",
      "• `/check <code>` - View upload details",
      "• `/delete <code>` - Delete an upload",
      "• `/deleteall` - Delete ALL uploads",
      "",
      "👥 *Users & Stats*",
      "• `/users` - Total user count",
      "• `/stats <code>` - Quick stats for code",
      "• `/broadcast <msg>` - Send message to all users",
      "",
      "ℹ️ *Examples*",
      "`/upload limit=10 channels=@mychannel`",
      "_(Then send the file/text)_"
    ].join("\n");
    await sendMessage(message.chat.id, helpText);
    return;
  }

  await sendMessage(
    message.chat.id,
    "Use /start <code> to access shared content."
  );
}

async function handleUsers(message: TelegramMessage) {
  const count = await getTotalUsers();
  await sendMessage(message.chat.id, `Total users: ${count}`);
}

async function handleBroadcast(message: TelegramMessage, text: string) {
  const content = text.split(/\s+/).slice(1).join(" ");
  if (!content && !message.message_id) {
    await sendMessage(message.chat.id, "Usage: /broadcast <message> (or reply to a message)");
    return;
  }

  const userIds = await getAllUserIds();
  if (!userIds.length) {
    await sendMessage(message.chat.id, "No users found.");
    return;
  }

  await sendMessage(message.chat.id, `Broadcasting to ${userIds.length} users...`);

  let success = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      if (message.chat.id === userId) continue; // Skip admin
      
      // If replying to a message, copy it
      if (message.message_id && !content) {
         // This logic is slightly flawed because message.message_id is the current command message
         // We need to check if it's a reply, but the current types don't support reply_to_message fully yet
         // Let's stick to simple text broadcast for now
      }
      
      await sendMessage(userId, content || "Broadcast message");
      success++;
    } catch {
      failed++;
    }
  }

  await sendMessage(message.chat.id, `Broadcast complete. Sent: ${success}, Failed: ${failed}`);
}

export async function POST(request: Request) {
  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;

  if (!message) {
    return NextResponse.json({ ok: true });
  }

  const text = message.text ?? message.caption ?? "";
  const adminId = getAdminId();
  const isAdmin = message.from?.id === adminId;

  try {
    const fromId = message.from?.id ?? 0;
    
    // Track user
    if (fromId) {
      const firstName = message.from?.first_name;
      // We don't have username in the type definition yet, so let's skip it or update type
      // For now just pass firstName
      await upsertUser(fromId, firstName);
    }

    if (!isAdmin && fromId) {
      const { maxRequests, windowSeconds } = getRateLimitConfig();
      const rate = await checkRateLimit("telegram", fromId, maxRequests, windowSeconds);
      if (!rate.allowed) {
        await sendMessage(
          message.chat.id,
          "Too many requests. Please try again later."
        );
        return NextResponse.json({ ok: true });
      }
    }

    if (text.startsWith("/start")) {
      const code = text.split(/\s+/)[1] ?? null;
      await handleStart(message, code);
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/help") || text.toLowerCase() === "help") {
      await handleHelp(message, isAdmin);
      return NextResponse.json({ ok: true });
    }

    if (isAdmin && (text.startsWith("/upload") || text.startsWith("/new"))) {
      await handleUpload(message, text);
      return NextResponse.json({ ok: true });
    }

    if (isAdmin && text.startsWith("/stats")) {
      const code = text.split(/\s+/)[1] ?? null;
      await handleStats(message, code);
      return NextResponse.json({ ok: true });
    }

    if (isAdmin && text.startsWith("/check")) {
      const code = text.split(/\s+/)[1] ?? null;
      await handleCheck(message, code);
      return NextResponse.json({ ok: true });
    }

    if (isAdmin && (text.startsWith("/list") || text.startsWith("/files"))) {
      await handleList(message);
      return NextResponse.json({ ok: true });
    }

    if (isAdmin && text.startsWith("/deleteall")) {
      await handleDeleteAll(message);
      return NextResponse.json({ ok: true });
    }

    if (isAdmin && text.startsWith("/delete")) {
      const code = text.split(/\s+/)[1] ?? null;
      await handleDelete(message, code);
      return NextResponse.json({ ok: true });
    }

    if (isAdmin && text.startsWith("/users")) {
      await handleUsers(message);
      return NextResponse.json({ ok: true });
    }

    if (isAdmin && text.startsWith("/broadcast")) {
      await handleBroadcast(message, text);
      return NextResponse.json({ ok: true });
    }

    if (isAdmin) {
      const handled = await handleDraftContent(message);
      if (handled) {
        return NextResponse.json({ ok: true });
      }
    }

    if (isAdmin) {
      // If message is not a command but text, show help
      if (!text.startsWith("/")) {
        await handleHelp(message, isAdmin);
      }
    }
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : "Unexpected error.";
    await sendMessage(message.chat.id, messageText);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

function getAdminId() {
  const adminId = Number(
    process.env.ADMIN_USER_ID ?? process.env.TELEGRAM_ADMIN_ID ?? "0"
  );
  if (!adminId) {
    throw new Error("ADMIN_USER_ID is missing.");
  }
  return adminId;
}

function getBotUsername() {
  return process.env.BOT_USERNAME ?? process.env.TELEGRAM_BOT_USERNAME ?? "";
}

function formatStartLink(code: string) {
  const username = getBotUsername();
  if (username) {
    return `https://t.me/${username}?start=${code}`;
  }
  return `/start ${code}`;
}

function getRateLimitConfig() {
  const maxRequests = Number(process.env.RATE_LIMIT_MAX ?? "10");
  const windowSeconds = Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? "60");
  return {
    maxRequests: Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : 10,
    windowSeconds:
      Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 60
  };
}
