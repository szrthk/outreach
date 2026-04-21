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
  
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [automationMode, setAutomationMode] = useState<"automatic" | "manual">("manual");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"outreach" | "command">("outreach");

  // Modal for manual follow-up
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [previewBody, setPreviewBody] = useState("");
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isSendingManual, setIsSendingManual] = useState(false);
  
  const consoleEndRef = useRef<HTMLDivElement>(null);

  async function refreshDashboard() {
    if (status !== "authenticated") return;
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/sheets/recent");
      const data = await res.json();
      if (data.logs) setRecentLogs(data.logs);
      if (data.config) setAutomationMode(data.config);
    } catch (error) {
      console.error("Dashboard refresh failed");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function toggleAutomationMode() {
    const nextMode = automationMode === "automatic" ? "manual" : "automatic";
    setAutomationMode(nextMode);
    try {
      await fetch("/api/sheets/recent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      addLog("success", `Automation mode set to ${nextMode}`);
    } catch (error) {
      addLog("error", "Failed to update automation mode.");
    }
  }

  useEffect(() => {
    if (status === "authenticated") {
      refreshDashboard();
    }
  }, [status]);

  const singlePreview = useMemo(
    () => ({
      subject: renderTemplate(subjectTemplate, single),
      body: renderTemplate(bodyTemplate, single),
    }),
    [single],
  );

  const [aiHook, setAiHook] = useState("");
  const [isGeneratingHook, setIsGeneratingHook] = useState(false);

  async function suggestHook() {
    if (!single.company) {
      addLog("error", "Please enter a company name first.");
      return;
    }
    
    setIsGeneratingHook(true);
    addLog("info", `Generating AI hook for ${single.company}...`);

    try {
      const response = await fetch("/api/ai/hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: single.company }),
      });
      const result = await response.json();
      if (result.hook) {
        setAiHook(result.hook);
        addLog("success", "AI Hook generated!");
      }
    } catch (error) {
      addLog("error", "Failed to generate AI hook.");
    } finally {
      setIsGeneratingHook(false);
    }
  }
  
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

  async function runAutomation() {
    setIsSendingBulk(true); // Reusing bulk state for progress indication
    addLog("info", "Starting AI Automation: Checking for replies and sending follow-ups...");

    try {
      const response = await fetch("/api/automation/run", {
        method: "POST",
      });
      const result = (await response.json()) as {
        success?: boolean;
        processed?: number;
        results?: any[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Automation engine failed.");
      }

      addLog("success", `Automation complete. Processed ${result.processed} contacts.`);
      refreshDashboard();
      result.results?.forEach(res => {
        addLog("info", `Contact ${res.email}: ${res.action} ${res.sentiment ? `(Sentiment: ${res.sentiment})` : ""}`);
      });
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : "Unexpected automation error.");
    } finally {
      setIsSendingBulk(false);
    }
  }

  async function openFollowUpModal(contact: any) {
    setSelectedContact(contact);
    setIsGeneratingPreview(true);
    try {
      const res = await fetch("/api/automation/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contact.name,
          company: contact.company,
          followUpCount: contact.followUpCount,
        }),
      });
      const data = await res.json();
      setPreviewBody(data.body);
    } catch (error) {
      addLog("error", "Failed to generate follow-up preview.");
    } finally {
      setIsGeneratingPreview(false);
    }
  }

  async function sendManualFollowUp() {
    if (!selectedContact) return;
    setIsSendingManual(true);
    try {
      const res = await fetch("/api/automation/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowIndex: selectedContact.rowIndex,
          email: selectedContact.email,
          subject: selectedContact.subject || `Follow-up: ${selectedContact.company}`,
          body: previewBody,
          followUpCount: selectedContact.followUpCount,
        }),
      });
      if (res.ok) {
        addLog("success", `Manual follow-up sent to ${selectedContact.email}`);
        setSelectedContact(null);
        refreshDashboard();
      } else {
        throw new Error("Failed to send");
      }
    } catch (error) {
      addLog("error", "Manual send failed.");
    } finally {
      setIsSendingManual(false);
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
            <p>DevOps Job Discovery & Follow-up Automation</p>
          </div>
          <div className={styles.authContainer}>
            <button 
              type="button" 
              onClick={runAutomation} 
              className={styles.secondaryButton}
              disabled={isSendingBulk}
              style={{ marginRight: '1rem', border: '1px solid var(--accent-light)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px', verticalAlign: 'middle'}}><path d="m12 8-1 1H9l-1 1v2l1 1h2l1 1 1-1h1v-1l1-1v-2l-1-1h-1z"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
              Quick Scan
            </button>
            <span>{session?.user?.email}</span>
            <button type="button" onClick={() => signOut()} className={styles.secondaryButton}>
              Sign out
            </button>
          </div>
        </header>

        <div className={styles.tabs}>
           <button 
             onClick={() => setActiveTab("outreach")} 
             className={`${styles.tabButton} ${activeTab === 'outreach' ? styles.tabButtonActive : ''}`}
           >
              Operations
           </button>
           <button 
             onClick={() => setActiveTab("command")} 
             className={`${styles.tabButton} ${activeTab === 'command' ? styles.tabButtonActive : ''}`}
           >
              Command Center
           </button>
        </div>

        {activeTab === "outreach" ? (
           <>
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
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            placeholder="Google"
                            value={single.company}
                            onChange={(event) => setSingle((prev) => ({ ...prev, company: event.target.value }))}
                            style={{ flex: 1 }}
                          />
                          <button 
                            type="button" 
                            onClick={suggestHook} 
                            className={styles.secondaryButton}
                            disabled={isGeneratingHook || !single.company}
                          >
                            {isGeneratingHook ? "..." : "✨ Hook"}
                          </button>
                        </div>
                      </label>
                    </div>
                    {aiHook && (
                      <div style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '3px solid var(--accent-light)' }}>
                         <p style={{fontSize: '0.85rem', margin: '0 0 4px', opacity: 0.7}}>AI Suggested Hook:</p>
                         <p style={{fontStyle: 'italic', margin: 0, fontSize: '0.9rem', color: '#fff'}}>{aiHook}</p>
                      </div>
                    )}
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={isSendingSingle || !single.email}
                      onClick={sendSingle}
                    >
                      {isSendingSingle ? "Sending..." : "Send Single Email"}
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
                <h2>Bulk Operations</h2>
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
                        <span>Live Status: {isSendingBulk ? "Busy" : "Ready"}</span>
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
           </>
        ) : (
           <section className={`${styles.glass} ${styles.card}`}>
             <div className={styles.cardHeader}>
                <h2>Outreach Command Center</h2>
                <div className={styles.headerActions}>
                   <button 
                     onClick={toggleAutomationMode} 
                     className={`${styles.secondaryButton} ${automationMode === 'automatic' ? styles.active : ''}`}
                   >
                     Mode: {automationMode.toUpperCase()}
                   </button>
                   <button onClick={refreshDashboard} className={styles.secondaryButton} disabled={isRefreshing}>
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isRefreshing ? 'spin' : ''}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                   </button>
                   <a 
                     href={`https://docs.google.com/spreadsheets/d/${process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID || '1JZOB8hGt13hm2lGJi_kQV6Ka5QGD4I6ShAjf8SUNpsY'}`} 
                     target="_blank" 
                     rel="noreferrer"
                     className={styles.secondaryButton}
                   >
                     Open Sheet
                   </a>
                </div>
             </div>
             
             <div className={styles.tableContainer}>
                <table className={styles.logTable}>
                   <thead>
                      <tr>
                         <th>Name</th>
                         <th>Company</th>
                         <th>Status</th>
                         <th>Sentiment</th>
                         <th>Follow-up</th>
                         <th>Action</th>
                      </tr>
                   </thead>
                   <tbody>
                      {recentLogs.map((log, i) => (
                         <tr key={i}>
                            <td>{log.name}</td>
                            <td>{log.company}</td>
                            <td>
                               <span className={`${styles.badge} ${log.status.includes('Replied') ? styles.badgeSuccess : log.status === 'No Reply' || log.status === 'Follow-up Due' ? styles.badgeWarning : ''}`}>
                                  {log.status}
                               </span>
                            </td>
                            <td>{log.sentiment}</td>
                            <td>{log.followUpDate}</td>
                            <td>
                               {log.status === "Follow-up Due" || log.status === "No Reply" ? (
                                  <button onClick={() => openFollowUpModal(log)} className={styles.miniButton}>
                                     Review
                                  </button>
                               ) : "-"}
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
           </section>
        )}

        {/* Manual Follow-up Modal */}
        {selectedContact && (
           <div className={styles.modalOverlay}>
              <div className={`${styles.glass} ${styles.modal}`}>
                 <h3>Personalize Follow-up</h3>
                 <p style={{fontSize: '0.9rem', marginBottom: '1.5rem', color: '#888'}}>
                    Thread: <strong>{selectedContact.company}</strong> | Count: {selectedContact.followUpCount}
                 </p>
                 
                 {isGeneratingPreview ? (
                    <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                       Generating AI Magic...
                    </div>
                 ) : (
                    <>
                       <textarea 
                          className={styles.editArea}
                          value={previewBody}
                          onChange={(e) => setPreviewBody(e.target.value)}
                       />
                       <div className={styles.modalActions}>
                          <button onClick={() => setSelectedContact(null)} className={styles.secondaryButton}>Discard</button>
                          <button 
                            onClick={sendManualFollowUp} 
                            className={styles.primaryButton}
                            disabled={isSendingManual}
                          >
                             {isSendingManual ? "Sending..." : "Send with Resume"}
                          </button>
                       </div>
                    </>
                 )}
              </div>
           </div>
        )}
      </main>
    </div>
  );
}
  );
}
