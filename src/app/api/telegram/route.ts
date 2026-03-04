import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  createDraft,
  createUpload,
  deleteDraft,
  getLatestDraft,
  getUploadByCode,
  listUploads,
  registerAccess,
  type UploadRecord,
  type UploadType
} from "../../../lib/db";
import {
  getChatMember,
  sendAnimation,
  sendAudio,
  sendDocument,
  sendMessage,
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
      await sendMessage(
        message.chat.id,
        `Join these channels/groups first: ${missing.join(", ")}`
      );
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

async function handleList(message: TelegramMessage) {
  const adminId = getAdminId();
  const uploads = await listUploads(adminId);
  if (!uploads.length) {
    await sendMessage(message.chat.id, "No uploads yet.");
    return;
  }

  const lines = uploads.map((upload) => {
    const limit = upload.max_access ?? "∞";
    return `${formatStartLink(upload.code)} | ${upload.access_count}/${limit}`;
  });
  await sendMessage(message.chat.id, lines.join("\n"));
}

async function handleHelp(message: TelegramMessage, isAdmin: boolean) {
  if (isAdmin) {
    const helpText = [
      "Admin help:",
      "/upload limit=10 channels=@channelA,@groupB Your text",
      "/upload limit=5 channels=@channelA",
      "Then send a file/image/video/audio/voice/animation",
      "/stats <code>",
      "/list"
    ].join("\n");
    await sendMessage(message.chat.id, helpText);
    return;
  }

  await sendMessage(
    message.chat.id,
    "Use /start <code> to access shared content."
  );
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

    if (isAdmin && text.startsWith("/list")) {
      await handleList(message);
      return NextResponse.json({ ok: true });
    }

    if (isAdmin) {
      const handled = await handleDraftContent(message);
      if (handled) {
        return NextResponse.json({ ok: true });
      }
    }

    if (isAdmin) {
      await sendMessage(
        message.chat.id,
        "Commands: /upload, /stats, /list"
      );
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
