export type ContactInput = {
  name: string;
  email: string;
  company: string;
};

export const DEFAULT_SUBJECT_TEMPLATE = "Opportunity at {{company}} - {{name}}";
export const DEFAULT_BODY_TEMPLATE = `Hi {{name}},

I hope you are doing well.

I wanted to share my profile for opportunities at {{company}}. Please find my resume attached.

Best regards`;

export function normalizeTemplateText(template: string): string {
  return template
    .replaceAll("\\r\\n", "\n")
    .replaceAll("\\n", "\n")
    .replaceAll("\\t", "\t");
}

export function renderTemplate(template: string, input: ContactInput): string {
  return normalizeTemplateText(template)
    .replaceAll("{{name}}", input.name)
    .replaceAll("{{email}}", input.email)
    .replaceAll("{{company}}", input.company);
}

export function getEmailTemplates() {
  return {
    subject: normalizeTemplateText(
      process.env.EMAIL_SUBJECT_TEMPLATE?.trim() ?? DEFAULT_SUBJECT_TEMPLATE,
    ),
    body: normalizeTemplateText(
      process.env.EMAIL_BODY_TEMPLATE?.trim() ?? DEFAULT_BODY_TEMPLATE,
    ),
  };
}
