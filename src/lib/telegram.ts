type TelegramResponse<T> = {
  ok: boolean;
  result: T;
  description?: string;
};

function resolveTelegramToken() {
  const telegramToken =
    process.env.TELEGRAM_BOT_TOKEN ?? process.env.BOT_TOKEN ?? "";
  if (!telegramToken) {
    throw new Error("Telegram bot token is missing.");
  }
  return telegramToken;
}

async function telegramRequest<T>(method: string, body: Record<string, unknown>) {
  const telegramToken = resolveTelegramToken();
  const apiBase = `https://api.telegram.org/bot${telegramToken}`;
  const response = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = (await response.json()) as TelegramResponse<T>;
  if (!data.ok) {
    throw new Error(data.description ?? "Telegram API error");
  }
  return data.result;
}

export async function sendMessage(chatId: number, text: string) {
  return telegramRequest("sendMessage", { chat_id: chatId, text });
}

export async function sendMessageWithKeyboard(
  chatId: number,
  text: string,
  keyboard: Array<Array<{ text: string; url?: string }>>
) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: keyboard }
  });
}

export async function sendDocument(chatId: number, fileId: string, caption?: string) {
  return telegramRequest("sendDocument", {
    chat_id: chatId,
    document: fileId,
    caption
  });
}

export async function sendPhoto(chatId: number, fileId: string, caption?: string) {
  return telegramRequest("sendPhoto", { chat_id: chatId, photo: fileId, caption });
}

export async function sendVideo(chatId: number, fileId: string, caption?: string) {
  return telegramRequest("sendVideo", { chat_id: chatId, video: fileId, caption });
}

export async function sendAudio(chatId: number, fileId: string, caption?: string) {
  return telegramRequest("sendAudio", { chat_id: chatId, audio: fileId, caption });
}

export async function sendVoice(chatId: number, fileId: string, caption?: string) {
  return telegramRequest("sendVoice", { chat_id: chatId, voice: fileId, caption });
}

export async function sendAnimation(chatId: number, fileId: string, caption?: string) {
  return telegramRequest("sendAnimation", {
    chat_id: chatId,
    animation: fileId,
    caption
  });
}

export async function copyMessage(
  chatId: number,
  fromChatId: number,
  messageId: number
) {
  return telegramRequest("copyMessage", {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId
  });
}

export async function getChatMember(chatId: string, userId: number) {
  return telegramRequest("getChatMember", {
    chat_id: chatId,
    user_id: userId
  });
}
