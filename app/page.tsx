"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import Papa from "papaparse";

import { normalizeTemplateText } from "@/lib/template";
import styles from "./page.module.css";

type Contact = {
  name: string;
  email: string;
  company: string;
};

type BulkResult = {
  index: number;
  email: string;
  status: "sent" | "failed";
  messageId?: string;
  error?: string;
};

type LogEntry = {
  id: string;
  time: string;
  type: "info" | "success" | "error";
  message: string;
};

const subjectTemplate = normalizeTemplateText(
  process.env.NEXT_PUBLIC_SUBJECT_TEMPLATE ?? "Opportunity at {{company}} - {{name}}",
);
const bodyTemplate = normalizeTemplateText(
  process.env.NEXT_PUBLIC_BODY_TEMPLATE ??
    "Hi {{name}},\n\nI wanted to share my profile for opportunities at {{company}}.\n\nBest regards",
);

function renderTemplate(template: string, contact: Contact) {
  return template
    .replaceAll("{{name}}", contact.name)
    .replaceAll("{{email}}", contact.email)
    .replaceAll("{{company}}", contact.company);
}

export default function Home() {
  const { data: session, status } = useSession();
  const [single, setSingle] = useState<Contact>({ name: "", email: "", company: "" });
  const [isSendingSingle, setIsSendingSingle] = useState(false);
  const [bulkContacts, setBulkContacts] = useState<Contact[]>([]);
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  
  const [logs, setLogs] = useState<LogEntry[]>([{
    id: "init",
    time: new Date().toLocaleTimeString(),
    type: "info",
    message: "System initialized. Ready to send emails."
  }]);
  
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const singlePreview = useMemo(
    () => ({
      subject: renderTemplate(subjectTemplate, single),
      body: renderTemplate(bodyTemplate, single),
    }),
    [single],
  );
  
  const addLog = (type: "info" | "success" | "error", message: string) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      time: new Date().toLocaleTimeString(),
      type,
      message
    }]);
  };

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function sendSingle() {
    setIsSendingSingle(true);
    addLog("info", `Sending single email to ${single.email}...`);

    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(single),
      });

      const result = (await response.json()) as {
        status?: string;
        error?: string;
        sheetLogError?: string | null;
      };
      
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to send email.");
      }

      if (result.sheetLogError) {
        addLog("error", `Email sent, but Sheet logging failed: ${result.sheetLogError}`);
      } else {
        addLog("success", `Email sent successfully to ${single.email} and logged.`);
      }
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setIsSendingSingle(false);
    }
  }

  async function sendBulk() {
    setIsSendingBulk(true);
    addLog("info", `Starting bulk send for ${bulkContacts.length} contacts...`);

    try {
      const response = await fetch("/api/send-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: bulkContacts }),
      });
      const result = (await response.json()) as {
        sent?: number;
        failed?: number;
        error?: string;
        results?: BulkResult[];
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to send bulk emails.");
      }

      const results = result.results ?? [];
      
      results.forEach(res => {
         if (res.status === "sent") {
            addLog("success", `Sent to ${res.email}`);
         } else {
            addLog("error", `Failed for ${res.email}: ${res.error}`);
         }
      });

      addLog("info", `Completed Bulk Send. Sent: ${result.sent ?? 0}, Failed: ${result.failed ?? 0}`);
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setIsSendingBulk(false);
    }
  }

  function onCsvUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    addLog("info", `Parsing CSV: ${file.name}...`);

    Papa.parse<Contact>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const normalized = results.data
          .map((row) => ({
            name: row.name?.trim() ?? "",
            email: row.email?.trim() ?? "",
            company: row.company?.trim() ?? "",
          }))
          .filter((row) => row.name || row.email || row.company);

        setBulkContacts(normalized);
        addLog("success", `Loaded ${normalized.length} contacts from CSV.`);
      },
      error: (error) => {
        setBulkContacts([]);
        addLog("error", `CSV Parsing error: ${error.message}`);
      },
    });
  }

  // Render hero if not authenticated
  if (status !== "authenticated") {
    return (
      <div className={styles.page}>
         <div className={`${styles.glass} ${styles.hero}`}>
            <h1>Outreach Assistant</h1>
            <p>Automate your job applications with personalized emails, resume attachments, and automatic tracking.</p>
            <button type="button" onClick={() => signIn("google")} className={styles.primaryButton}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/></svg>
              Sign in with Google
            </button>
         </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={`${styles.glass} ${styles.header}`}>
          <div className={styles.headerContent}>
            <h1>Outreach Assistant</h1>
            <p>Fill details, log automatically, standard bulk operations</p>
          </div>
          <div className={styles.authContainer}>
            <span>{session?.user?.email}</span>
            <button type="button" onClick={() => signOut()} className={styles.secondaryButton}>
              Sign out
            </button>
          </div>
        </header>

        <section className={`${styles.glass} ${styles.card}`}>
          <h2>Single Send</h2>
          <div className={styles.cardContent}>
            <div className={styles.formArea}>
              <div className={styles.grid}>
                <label>
                  Name
                  <input
                    placeholder="John Doe"
                    value={single.name}
                    onChange={(event) => setSingle((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </label>
                <label>
                  Email
                  <input
                    placeholder="john@example.com"
                    value={single.email}
                    onChange={(event) => setSingle((prev) => ({ ...prev, email: event.target.value }))}
                  />
                </label>
                <label>
                  Company
                  <input
                    placeholder="Google"
                    value={single.company}
                    onChange={(event) => setSingle((prev) => ({ ...prev, company: event.target.value }))}
                  />
                </label>
              </div>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={isSendingSingle || !single.email}
                onClick={sendSingle}
              >
                {isSendingSingle ? (
                   <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      Sending...
                   </>
                ) : "Send Single Email"}
              </button>
            </div>

            <div className={styles.preview}>
              <h3>Preview</h3>
              <p>
                <strong>Subj:</strong> {singlePreview.subject || "..."}
              </p>
              <pre>{singlePreview.body}</pre>
            </div>
          </div>
        </section>

        <section className={`${styles.glass} ${styles.card}`}>
          <h2>Bulk Operations Workflow</h2>
          <div className={styles.cardContent}>
            <div className={styles.formArea}>
               <label className={styles.fileUpload}>
                 <span>Click to upload CSV (name, email, company)</span>
                 <input type="file" accept=".csv,text/csv" onChange={onCsvUpload} />
               </label>
               <button
                 type="button"
                 className={styles.primaryButton}
                 disabled={isSendingBulk || bulkContacts.length === 0}
                 onClick={sendBulk}
               >
                 {isSendingBulk ? "Processing Batch..." : `Send Batch (${bulkContacts.length})`}
               </button>
            </div>
            
            <div className={styles.console}>
               <div className={styles.consoleHeader}>
                  <span>System Console</span>
                  <span>Target: {bulkContacts.length > 0 ? bulkContacts.length : "0"} / Auth: OK</span>
               </div>
               {logs.map((log) => (
                  <div key={log.id} className={styles.consoleLine}>
                     <span className={styles.consoleTime}>[{log.time}]</span>
                     <span className={`${styles.consoleBadge} ${log.type === 'success' ? styles.badgeSuccess : log.type === 'error' ? styles.badgeError : styles.badgeInfo}`}>
                        {log.type}
                     </span>
                     <span className={styles.consoleMessage}>{log.message}</span>
                  </div>
               ))}
               <div ref={consoleEndRef} />
            </div>
          </div>
        </section>
        
        {/* Style for spinner */}
        <style dangerouslySetInnerHTML={{__html: `
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { 100% { transform: rotate(360deg); } }
        `}} />
      </main>
    </div>
  );
}
