import { IdentifierGenerationError } from "./editorTypes";

export type IdFactory = () => string;

export const generateSecureId: IdFactory = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  throw new IdentifierGenerationError("Secure identifier generation is unavailable");
};
