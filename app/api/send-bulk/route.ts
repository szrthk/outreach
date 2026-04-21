import path from "node:path";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { sendEmailWithAttachment } from "@/lib/gmail";
import { appendLogRow } from "@/lib/sheets";
import { getEmailTemplates, renderTemplate, type ContactInput } from "@/lib/template";
import { validateContact } from "@/lib/validation";

type BulkPayload = {
  contacts: ContactInput[];
};

type BulkResult = {
  index: number;
  email: string;
  status: "sent" | "failed";
  messageId?: string;
  error?: string;
};

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

  const body = (await request.json()) as BulkPayload;
  const contacts = body.contacts ?? [];

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json(
      { error: "contacts must be a non-empty array." },
      { status: 400 },
    );
  }

  const attachmentPath =
    process.env.RESUME_PATH ?? path.join(process.cwd(), "storage", "resume.pdf");
  const templates = getEmailTemplates();
  const seenEmails = new Set<string>();
  const results: BulkResult[] = [];

  for (let index = 0; index < contacts.length; index += 1) {
    const contact = contacts[index];
    const email = contact.email.trim().toLowerCase();

    if (seenEmails.has(email)) {
      results.push({
        index,
        email: contact.email,
        status: "failed",
        error: "Duplicate email in this upload batch.",
      });
      continue;
    }

    seenEmails.add(email);
    const validationError = validateContact(contact);

    if (validationError) {
      results.push({
        index,
        email: contact.email,
        status: "failed",
        error: validationError,
      });
      continue;
    }

    const subject = renderTemplate(templates.subject, contact);
    const emailBody = renderTemplate(templates.body, contact);

    try {
      const messageId = await sendEmailWithAttachment({
        accessToken,
        to: contact.email.trim(),
        subject,
        body: emailBody,
        attachmentPath,
      });

      const sheetLogError = await appendLogSafely(accessToken, {
        name: contact.name,
        email: contact.email,
        company: contact.company,
        subject,
        status: "sent",
        messageId,
      });

      results.push({
        index,
        email: contact.email,
        status: "sent",
        messageId,
        ...(sheetLogError ? { error: `Sheet log failed: ${sheetLogError}` } : {}),
      });
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

      results.push({
        index,
        email: contact.email,
        status: "failed",
        error: sheetLogError
          ? `${message}. Sheet log failed: ${sheetLogError}`
          : message,
      });
    }
  }

  return NextResponse.json({
    total: contacts.length,
    sent: results.filter((row) => row.status === "sent").length,
    failed: results.filter((row) => row.status === "failed").length,
    results,
  });
}
