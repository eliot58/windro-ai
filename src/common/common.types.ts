export interface SubmittedForm {
  fields: Record<string, string>;
  file?: { name: string; content: Buffer };
}
