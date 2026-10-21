import { describe, it, expect } from "vitest";
import { addMissingLocalDefaults } from "../scripts/local-defaults.mjs";
describe("local environment setup", () => {
  it("preserves configured origins and storage bindings exactly", () => {
    const content =
      'APP_ORIGIN="https://existing.example.test"\nHAC_STORAGE_PATH="D:/HAC Evidence"\nUPLOAD_DIR="D:/HAC Images"\n';
    expect(addMissingLocalDefaults(content)).toBe(content);
  });
  it("adds missing defaults once and is repeatable", () => {
    const first = addMissingLocalDefaults(
      "# User configuration\nDEMO_MODE=true\n",
    );
    expect(first).toContain('APP_ORIGIN="http://localhost:3000"\n');
    expect(first.match(/^APP_ORIGIN=/gm)).toHaveLength(1);
    expect(addMissingLocalDefaults(first)).toBe(first);
  });
  it("preserves whitespace, exported bindings and Windows CRLF line endings", () => {
    const content =
      '  export APP_ORIGIN = "http://localhost:4000"\r\n\tHAC_STORAGE_PATH = "D:/Storage"\r\n';
    const result = addMissingLocalDefaults(content);
    expect(result).toBe(content + 'UPLOAD_DIR="./uploads"\r\n');
    expect(addMissingLocalDefaults(result)).toBe(result);
  });
  it("ignores commented examples and separates a final unterminated line", () => {
    const content = '# APP_ORIGIN="http://example.test"\nDEMO_MODE=true';
    const result = addMissingLocalDefaults(content);
    expect(result).toContain("DEMO_MODE=true\nAPP_ORIGIN=");
    expect(result.match(/^APP_ORIGIN=/gm)).toHaveLength(1);
  });
});
