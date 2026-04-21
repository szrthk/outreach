import path from "node:path";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { sendEmailWithAttachment } from "@/lib/gmail";
import { appendLogRow } from "@/lib/sheets";
import { getEmailTemplates, renderTemplate, type ContactInput } from "@/lib/template";
import { validateContact } from "@/lib/validation";

async function appendLogSafely(
  accessToken: string,
  payload: Parameters<typeof appendLogRow>[1],
) {
  try {
    await appendLogRow(accessToken, payload);
    return null;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Google Sheet log error";
    console.error("Failed to append row to Google Sheet", error);
    return message;
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const accessToken = session?.accessToken;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contact = (await request.json()) as ContactInput;
  const validationError = validateContact(contact);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const templates = getEmailTemplates();
  const subject = renderTemplate(templates.subject, contact);
  const body = renderTemplate(templates.body, contact);
  const attachmentPath =
    process.env.RESUME_PATH ?? path.join(process.cwd(), "storage", "resume.pdf");

  try {
    const { messageId, threadId } = await sendEmailWithAttachment({
      accessToken,
      to: contact.email.trim(),
      subject,
      body,
      attachmentPath,
    });

    const sheetLogError = await appendLogSafely(accessToken, {
      name: contact.name,
      email: contact.email,
      company: contact.company,
      subject,
      status: "sent",
      messageId,
      threadId,
      followUpCount: 0,
    });

    return NextResponse.json({ status: "sent", messageId, threadId, sheetLogError });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown send failure";

    const sheetLogError = await appendLogSafely(accessToken, {
      name: contact.name,
      email: contact.email,
      company: contact.company,
      subject,
      status: "failed",
      error: message,
    });

    return NextResponse.json(
      { status: "failed", error: message, sheetLogError },
      { status: 500 },
    );
  }
}
