## Outreach Assistant

Web app to:
- Fill `name`, `email`, `company`
- Auto-render your predefined email subject/body
- Send from your Gmail account with attached resume
- Append each send result to Google Sheets
- Support both single and bulk CSV sending

## Setup

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `cp .env.example .env.local`
3. Create Google OAuth credentials in Google Cloud Console and enable:
   - Gmail API
   - Google Sheets API
4. Fill `.env.local` values:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `NEXTAUTH_SECRET`
   - `GOOGLE_SHEET_ID`
5. Place your fixed resume at `public/resume.pdf` (or set custom `RESUME_PATH`).

## Google Sheet format

Sheet row format now matches your tracker:
1. `#` (left blank, so your sheet auto numbering/formulas can handle it)
2. `Name`
3. `Company`
4. `Role` (from `OUTREACH_ROLE`)
5. `Platform` (from `OUTREACH_PLATFORM`, default `Email`)
6. `Email / Handle`
7. `Date Sent` (`DD-MMM-YYYY`)
8. `Follow-up Date` (`Date Sent + FOLLOW_UP_DAYS`)
9. `Status` (`No Reply` on send success, `Failed` on send failure)
10. `Notes` (send summary/error details)

Set `GOOGLE_SHEET_RANGE` if your tab/range is different.

## CSV format for bulk

CSV headers must be:
- `name`
- `email`
- `company`

## Run

Start the app:
- `npm run dev`

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

## Notes

- Subject/body templates are controlled by `EMAIL_SUBJECT_TEMPLATE` and `EMAIL_BODY_TEMPLATE`.
- UI preview uses `NEXT_PUBLIC_SUBJECT_TEMPLATE` and `NEXT_PUBLIC_BODY_TEMPLATE`.
- Duplicate emails in one bulk upload are skipped and marked failed.
