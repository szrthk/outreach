import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { analyzeSentiment, generateFollowUp } from "@/lib/ai";
import { checkThreadForReplies, sendEmailWithAttachment } from "@/lib/gmail";
import { getContactsToFollowUp, updateLogRow } from "@/lib/sheets";

export async function POST() {
  const session = await getServerSession(authOptions);
  const accessToken = session?.accessToken;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contacts = await getContactsToFollowUp(accessToken);
    const results = [];

    for (const contact of contacts) {
      // 1. Check for replies
      const replies = await checkThreadForReplies(
        accessToken,
        contact.threadId,
        contact.messageId,
      );

      if (replies.length > 0) {
        // Someone replied! 
        const lastReply = replies[replies.length - 1];
        // We'd ideally fetch the full body here, but for now we'll assume metadata check is first step.
        // For sentiment analysis, we need the actual snippet or body.
        
        // Let's mark as replied and stop automation
        const sentiment = await analyzeSentiment(lastReply.snippet || "New reply received");
        
        await updateLogRow(accessToken, contact.rowIndex, {
          status: `Replied (${sentiment})`,
          notes: `Reply detected on ${new Date().toLocaleDateString()}. Automation stopped.`,
          sentiment,
        });

        results.push({ email: contact.email, action: "detected-reply", sentiment });
        continue;
      }

      // 2. If no reply, check if we should send a follow-up
      if (contact.followUpCount < 3) {
        const nextCount = contact.followUpCount + 1;
        const aiBody = await generateFollowUp(
          process.env.EMAIL_BODY_TEMPLATE || "", // Using template as context
          contact.name,
          contact.company,
          nextCount,
        );

        const { messageId } = await sendEmailWithAttachment({
          accessToken,
          to: contact.email,
          subject: contact.subject, // Threading handles this but we pass it anyway
          body: aiBody,
          attachmentPath: process.env.RESUME_PATH || "storage/resume.pdf",
        });

        // Set next follow-up date (5 days later by default)
        const nextFollowUp = new Date();
        nextFollowUp.setDate(nextFollowUp.getDate() + 5);

        await updateLogRow(accessToken, contact.rowIndex, {
          messageId,
          followUpCount: nextCount,
          followUpDate: nextFollowUp,
          notes: `Sent AI follow-up #${nextCount} on ${new Date().toLocaleDateString()}.`,
        });

        results.push({ email: contact.email, action: "sent-followup", count: nextCount });
      } else {
        // Max follow-ups reached
        await updateLogRow(accessToken, contact.rowIndex, {
          status: "Closed (No Reply)",
          notes: "Max follow-ups (3) reached. Closing.",
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
