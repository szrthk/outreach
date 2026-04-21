import path from "node:path";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { analyzeSentiment, generateFollowUp } from "@/lib/ai";
import { checkThreadForReplies, sendEmailWithAttachment } from "@/lib/gmail";
import { getContactsToFollowUp, updateLogRow, getAutomationConfig } from "@/lib/sheets";

export async function POST(request: Request) {
  // Check for Cron Secret if triggered by Vercel
  const authHeader = request.headers.get('Authorization');
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  const session = await getServerSession(authOptions);
  let accessToken = session?.accessToken;

  // IMPORTANT: For headless cron to work via Vercel, it needs a valid accessToken.
  // Since we don't have a database, the cron will only succeed if a user has a valid
  // session or if we implement a persistent token system later.
  if (!accessToken && isCron) {
    console.error("Cron triggered but no active session found for accessToken. Automation skipped.");
    return NextResponse.json({ error: "No active session for Cron execution. Automated follow-ups require a valid OAuth token." }, { status: 401 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
  }

  try {
    const token = accessToken as string;
    const mode = await getAutomationConfig(token);
    const contacts = await getContactsToFollowUp(token);
    const results = [];

    for (const contact of contacts) {
      const replies = await checkThreadForReplies(
        token,
        contact.threadId,
        contact.messageId,
      );

      if (replies.length > 0) {
        const lastReply = replies[replies.length - 1];
        const sentiment = await analyzeSentiment(lastReply.snippet || "New reply received");
        
        await updateLogRow(token, contact.rowIndex, {
          status: `Replied (${sentiment})`,
          notes: `Reply detected on ${new Date().toLocaleDateString()}. Automation stopped.`,
          sentiment,
        });

        results.push({ email: contact.email, action: "detected-reply", sentiment });
        continue;
      }

      // Only attempt automated follow-up if it's due and we are in automatic mode
      if (contact.isDue && contact.followUpCount < 3) {
        if (mode === "automatic") {
          const nextCount = contact.followUpCount + 1;
          const aiBody = await generateFollowUp(
            process.env.EMAIL_BODY_TEMPLATE || "",
            contact.name,
            contact.company,
            nextCount,
          );

          const { messageId } = await sendEmailWithAttachment({
            accessToken: token,
            to: contact.email,
            subject: contact.subject || `Follow-up: ${contact.company}`,
            body: aiBody,
            attachmentPath:
              process.env.RESUME_PATH &&
              process.env.RESUME_PATH !== "storage/resume.pdf"
                ? process.env.RESUME_PATH
                : path.join(process.cwd(), "public", "resume.pdf"),
          });

          const nextFollowUp = new Date();
          nextFollowUp.setDate(nextFollowUp.getDate() + 5);

          await updateLogRow(token, contact.rowIndex, {
            messageId,
            followUpCount: nextCount,
            followUpDate: nextFollowUp,
            notes: `Auto-sent follow-up #${nextCount} on ${new Date().toLocaleDateString()}.`,
          });

          results.push({ email: contact.email, action: "sent-followup-auto", count: nextCount });
        } else {
          // Manual mode: Just flag it for the user
          await updateLogRow(token, contact.rowIndex, {
            status: "Follow-up Due",
            notes: "Follow-up is ready for manual review.",
          });
          results.push({ email: contact.email, action: "flagged-manual" });
        }
      } else {
        await updateLogRow(token, contact.rowIndex, {
          status: "Closed (No Reply)",
          notes: "Max follow-ups reached.",
        });
        results.push({ email: contact.email, action: "closed-max-reached" });
      }
    }

    return NextResponse.json({ success: true, processed: contacts.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
