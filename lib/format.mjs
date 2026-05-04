// Client-side secret redaction. Runs before the tool input is sent to the
// public API so credentials never leave the user's machine in plain text.

const SECRET_PATTERNS = [
  /\b(sk-[A-Za-z0-9_-]{16,})\b/g,
  /\b(xox[abrs]-[A-Za-z0-9-]{10,})\b/g,
  /\b(AKIA[0-9A-Z]{12,})\b/g,
  /\b(ghp_[A-Za-z0-9]{20,})\b/g,
  /\b(gho_[A-Za-z0-9]{20,})\b/g,
  /\bBearer\s+([A-Za-z0-9._-]{16,})/gi,
];

export function redact(text) {
  let out = String(text);
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (_, captured) => {
      const head = captured.slice(0, 4);
      return `${head}***REDACTED***`;
    });
  }
  return out;
}
