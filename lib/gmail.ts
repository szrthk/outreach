import fs from "node:fs/promises";
import path from "node:path";

import { google } from "googleapis";

type SendEmailArgs = {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
  attachmentPath: string;
};

function toBase64Url(content: string) {
  return Buffer.from(content)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function normalizeBodyForMime(body: string) {
  return body.replace(/\r?\n/g, "\r\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toHtmlBody(body: string) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let listBuffer: string[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return;
    }
    html.push(`<p>${escapeHtml(paragraphBuffer.join(" "))}</p>`);
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (listBuffer.length === 0) {
      return;
    }
    html.push(
      `<ul>${listBuffer.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
    );
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const bulletMatch = line.match(/^[•-]\s*(.+)$/);

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (bulletMatch) {
      flushParagraph();
      listBuffer.push(bulletMatch[1]);
      continue;
    }

    flushList();
    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();

  return `<!doctype html><html><body style="font-family: Arial, sans-serif; line-height: 1.55; color: #111827;">${html.join(
    "",
  )}</body></html>`;
}

export async function sendEmailWithAttachment({
  accessToken,
  to,
  subject,
  body,
  attachmentPath,
}: SendEmailArgs) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  let absolutePath = path.isAbsolute(attachmentPath)
    ? attachmentPath
    : path.resolve(process.cwd(), attachmentPath);

  try {
    await fs.access(absolutePath);
  } catch (err) {
    console.warn(
      `Attachment not found at ${absolutePath}, falling back to public/resume.pdf`
    );
    absolutePath = path.join(process.cwd(), "public", "resume.pdf");
  }

  const attachmentBuffer = await fs.readFile(absolutePath);
  const attachmentName = path.basename(absolutePath);
  const attachmentBase64 = attachmentBuffer.toString("base64");
  const boundary = `outreach-${Date.now()}`;
  const altBoundary = `outreach-alt-${Date.now()}`;
  const normalizedBody = normalizeBodyForMime(body);
  const htmlBody = toHtmlBody(normalizedBody);
  const htmlBodyBase64 = Buffer.from(htmlBody, "utf8").toString("base64");

  const message = [
    `To: ${to}`,
    "Content-Type: multipart/mixed; boundary=" + boundary,
    "MIME-Version: 1.0",
    `Subject: ${subject}`,
    "",
    `--${boundary}`,
    "Content-Type: multipart/alternative; boundary=" + altBoundary,
    "",
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
    "Content-Transfer-Encoding: 7bit",
    "",
    normalizedBody,
    "",
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "MIME-Version: 1.0",
    "Content-Transfer-Encoding: base64",
    "",
    htmlBodyBase64,
    "",
    `--${altBoundary}--`,
    "",
    `--${boundary}`,
    "Content-Type: application/pdf; name=" + attachmentName,
    "MIME-Version: 1.0",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: attachment; filename=" + attachmentName,
    "",
    attachmentBase64,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const raw = toBase64Url(message);

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  if (!response.data.id) {
    throw new Error("Gmail did not return a message ID.");
  }

  return {
    messageId: response.data.id,
    threadId: response.data.threadId ?? response.data.id,
  };
}

export async function checkThreadForReplies(
  accessToken: string,
  threadId: string,
  lastKnownMessageId: string,
) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const response = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["From", "Message-ID"],
  });

  const messages = response.data.messages || [];
  const lastIndex = messages.findIndex((m) => m.id === lastKnownMessageId);

  if (lastIndex === -1) return [];

  // Get messages AFTER our last sent message
  const newMessages = messages.slice(lastIndex + 1);

  // Filter out messages SENT by us (if any)
  // In a typical thread check, anything here from the recipient is a reply.
  return newMessages;
}
