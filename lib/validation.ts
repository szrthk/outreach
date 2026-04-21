import type { ContactInput } from "@/lib/template";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContact(input: ContactInput) {
  if (!input.name.trim() || !input.email.trim() || !input.company.trim()) {
    return "Name, email, and company are required.";
  }

  if (!EMAIL_REGEX.test(input.email.trim())) {
    return "Please provide a valid recipient email.";
  }

  return null;
}
