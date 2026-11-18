export interface SubmittedForm {
  fields: Record<string, string>;
  file?: { name: string; mimeType: string; content: Buffer };
}
