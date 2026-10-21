const DEFAULTS = [
  ["APP_ORIGIN", "http://localhost:3000"],
  ["HAC_STORAGE_PATH", "./.local/storage"],
  ["UPLOAD_DIR", "./uploads"],
];

/** Add nonsecret local defaults without replacing existing bindings, including Windows CRLF files.
 * @param {string} content
 * @returns {string}
 */
export function addMissingLocalDefaults(content) {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  for (const [name, value] of DEFAULTS) {
    const binding = new RegExp(
      `^[\\t ]*(?:export[\\t ]+)?${name}[\\t ]*=`,
      "m",
    );
    if (!binding.test(content)) {
      if (content && !content.endsWith("\n")) content += newline;
      content += `${name}="${value}"${newline}`;
    }
  }
  return content;
}
