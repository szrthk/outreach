import { google } from "googleapis";

export type SheetLogRow = {
  name: string;
  email: string;
  company: string;
  subject: string;
  status: "sent" | "failed";
  messageId?: string;
  threadId?: string;
  error?: string;
  followUpCount?: number;
  sentiment?: string;
};

function formatSheetDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getSheetNameFromRange(range: string) {
  const separatorIndex = range.indexOf("!");
  if (separatorIndex === -1) {
    return "Sheet1";
  }

  return range.slice(0, separatorIndex);
}

async function getNextSerialNumber(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetName: string,
) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:A`,
  });

  const rows = response.data.values ?? [];
  let maxSerial = 0;

  for (const row of rows) {
    const value = row[0];
    const serial = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isNaN(serial) && serial > maxSerial) {
      maxSerial = serial;
    }
  }

  return maxSerial + 1;
}

export async function appendLogRow(accessToken: string, row: SheetLogRow) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_SHEET_RANGE ?? "Sheet1!A:J";
  const role = process.env.OUTREACH_ROLE ?? "DevOps Engineer";
  const platform = process.env.OUTREACH_PLATFORM ?? "Email";
  const followUpDays = Number.parseInt(process.env.FOLLOW_UP_DAYS ?? "5", 10);

  if (!spreadsheetId || spreadsheetId === "your-google-sheet-id") {
    throw new Error("GOOGLE_SHEET_ID is not set.");
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  const sheetName = getSheetNameFromRange(range);
  const serialNumber = await getNextSerialNumber(sheets, spreadsheetId, sheetName);
  const sentDate = new Date();
  const followUpDate = addDays(
    sentDate,
    Number.isNaN(followUpDays) ? 5 : followUpDays,
  );
  const sheetStatus = row.status === "sent" ? "No Reply" : "Failed";
  const notes =
    row.status === "sent"
      ? "Sent cold email. Follow up pending."
      : `Send failed: ${row.error ?? "Unknown error"}`;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          serialNumber,
          row.name,
          row.company,
          role,
          platform,
          row.email,
          formatSheetDate(sentDate),
          formatSheetDate(followUpDate),
          sheetStatus,
          notes,
          row.messageId ?? "",
          row.threadId ?? "",
          row.followUpCount ?? 0,
          row.sentiment ?? "",
        ],
      ],
    },
  });
}

export async function getContactsToFollowUp(accessToken: string) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_SHEET_RANGE ?? "Sheet1!A:N";

  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID missing");

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values ?? [];
  if (rows.length <= 1) return []; // Only header or empty

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return rows
    .slice(1) // Skip header
    .map((row, index) => ({
      rowIndex: index + 2, // 1-indexed + header
      serialNumber: row[0],
      name: row[1],
      company: row[2],
      role: row[3],
      platform: row[4],
      email: row[5],
      sentDate: row[6],
      followUpDate: row[7],
      status: row[8],
      notes: row[9],
      messageId: row[10],
      threadId: row[11],
      followUpCount: parseInt(row[12] || "0", 10),
      sentiment: row[13],
    }))
    .filter((contact) => {
      if (contact.status !== "No Reply") return false;
      const fDate = new Date(contact.followUpDate);
      return fDate <= today;
    });
}

export async function updateLogRow(
  accessToken: string,
  rowIndex: number,
  updates: Partial<SheetLogRow> & {
    status?: string;
    notes?: string;
    followUpDate?: Date;
  },
) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = getSheetNameFromRange(
    process.env.GOOGLE_SHEET_RANGE ?? "Sheet1!A:N",
  );

  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID missing");

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });

  // Map updates to specific columns
  // Status is I (9), Follow Up Date is H (8), Notes is J (10), 
  // Message ID is K (11), Follow Up Count is M (13), Sentiment is N (14)
  
  const writeValue = async (col: string, value: any) => {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!${col}${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [[value]] },
    });
  };

  if (updates.status) await writeValue("I", updates.status);
  if (updates.followUpDate) await writeValue("H", formatSheetDate(updates.followUpDate));
  if (updates.notes) await writeValue("J", updates.notes);
  if (updates.messageId) await writeValue("K", updates.messageId);
  if (updates.followUpCount !== undefined) await writeValue("M", updates.followUpCount);
  if (updates.sentiment) await writeValue("N", updates.sentiment);
}
