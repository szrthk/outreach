import { google } from "googleapis";

export type SheetLogRow = {
  name: string;
  email: string;
  company: string;
  subject: string;
  status: "sent" | "failed";
  messageId?: string;
  error?: string;
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
        ],
      ],
    },
  });
}
