import { describe, expect, it } from "vitest";
import {
  EncryptedObservationQueue,
  type DraftStore,
  type EncryptedDraft,
} from "../src/lib/offline";
class MemoryStore implements DraftStore {
  values = new Map<string, EncryptedDraft>();
  async all() {
    return [...this.values.values()];
  }
  async put(value: EncryptedDraft) {
    this.values.set(value.id, value);
  }
  async delete(id: string) {
    this.values.delete(id);
  }
}
const draft = (clientMutationId = "mutation-1") => ({
  inspectionId: "inspection-1",
  expectedVersion: 1,
  masterDataVersion: "sha256:cached-data",
  payload: {
    clientMutationId,
    observedName: "Private product name",
    notes: "Confidential inspector note",
    identityConfirmed: true,
  },
});
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status });
const network = (
  version = 1,
  observations: Array<{ clientMutationId: string }> = [],
) =>
  (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith("/me")) return json({ id: "user-1" });
    if (init?.method === "POST") return json({ id: "saved" }, 201);
    return json({ version, status: "IN_PROGRESS", observations });
  }) as typeof fetch;

describe("session-bound encrypted offline drafts", () => {
  it("requires an authenticated session before storing or accessing drafts", async () => {
    const queue = new EncryptedObservationQueue(new MemoryStore());
    await expect(queue.enqueue(draft())).rejects.toMatchObject({
      code: "SESSION_LOCKED",
    });
    await expect(queue.unlock("")).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    });
  });
  it("stores ciphertext and unique random IVs, with no plaintext product data", async () => {
    const store = new MemoryStore();
    const queue = new EncryptedObservationQueue(store);
    await queue.unlock("user-1");
    await queue.enqueue(draft());
    await queue.enqueue(draft("mutation-2"));
    const entries = await store.all();
    expect(JSON.stringify(entries)).not.toContain("Private product");
    expect(new TextDecoder().decode(entries[0].ciphertext)).not.toContain(
      "Private product",
    );
    expect(new Uint8Array(entries[0].iv)).not.toEqual(
      new Uint8Array(entries[1].iv),
    );
    const pending = await queue.pending();
    expect(pending[0].payload.notes).toBe("Confidential inspector note");
    expect(pending.map((entry) => entry.expectedVersion)).toEqual([1, 2]);
    expect(pending[0].verificationStatus).toBe("REQUIRES_ONLINE_REVALIDATION");
  });
  it("preserves idempotency keys and avoids duplicate queued mutations", async () => {
    const queue = new EncryptedObservationQueue(new MemoryStore());
    await queue.unlock("user-1");
    const first = await queue.enqueue(draft());
    const duplicate = await queue.enqueue(draft());
    expect(duplicate.id).toBe(first.id);
    expect(await queue.pending()).toHaveLength(1);
  });
  it("does not expose another signed-in account drafts", async () => {
    const queue = new EncryptedObservationQueue(new MemoryStore());
    await queue.unlock("user-1");
    await queue.enqueue(draft());
    await queue.unlock("user-2");
    expect(await queue.pending()).toHaveLength(0);
  });
  it("detects ciphertext tampering through authenticated encryption", async () => {
    const store = new MemoryStore();
    const queue = new EncryptedObservationQueue(store);
    await queue.unlock("user-1");
    await queue.enqueue(draft());
    const [entry] = await store.all();
    new Uint8Array(entry.ciphertext)[0] ^= 1;
    await expect(queue.pending()).rejects.toMatchObject({
      code: "KEY_UNAVAILABLE",
    });
  });
  it("does not persist the memory key across reloads and reports unavailable drafts explicitly", async () => {
    const store = new MemoryStore();
    const first = new EncryptedObservationQueue(store);
    await first.unlock("user-1");
    await first.enqueue(draft());
    const reloaded = new EncryptedObservationQueue(store);
    await reloaded.unlock("user-1");
    await expect(reloaded.pending()).rejects.toMatchObject({
      code: "KEY_UNAVAILABLE",
    });
    expect(await reloaded.count()).toBe(1);
  });
  it("synchronizes through authenticated server verification rather than offline approval", async () => {
    const queue = new EncryptedObservationQueue(new MemoryStore(), network());
    await queue.unlock("user-1");
    const queued = await queue.enqueue(draft());
    expect(await queue.sync()).toEqual({ synced: [queued.id], pending: 0 });
  });
  it("synchronizes sequential queued observations with their planned optimistic versions", async () => {
    let version = 1;
    const observations: Array<{ clientMutationId: string }> = [];
    const send = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/me")) return json({ id: "user-1" });
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body.version).toBe(version);
        observations.push({ clientMutationId: body.clientMutationId });
        version++;
        return json({ id: "saved" }, 201);
      }
      return json({ version, status: "IN_PROGRESS", observations });
    }) as typeof fetch;
    const queue = new EncryptedObservationQueue(new MemoryStore(), send);
    await queue.unlock("user-1");
    await queue.enqueue(draft());
    await queue.enqueue(draft("mutation-2"));
    expect(await queue.sync()).toMatchObject({ pending: 0 });
    expect(version).toBe(3);
  });
  it("retains a draft when an inspection has already been submitted", async () => {
    const send = (async (url: RequestInfo | URL) =>
      String(url).endsWith("/me")
        ? json({ id: "user-1" })
        : json({
            version: 1,
            status: "SUBMITTED",
            observations: [],
          })) as typeof fetch;
    const queue = new EncryptedObservationQueue(new MemoryStore(), send);
    await queue.unlock("user-1");
    await queue.enqueue(draft());
    expect(await queue.sync()).toMatchObject({
      pending: 1,
      conflict: { code: "INSPECTION_LOCKED" },
    });
  });
  it("retains a draft when inspection version conflicts", async () => {
    const queue = new EncryptedObservationQueue(new MemoryStore(), network(2));
    await queue.unlock("user-1");
    await queue.enqueue(draft());
    expect(await queue.sync()).toMatchObject({
      pending: 1,
      conflict: { code: "VERSION_CONFLICT" },
    });
  });
  it("reconciles a successful mutation whose earlier response was lost without duplication", async () => {
    const queue = new EncryptedObservationQueue(
      new MemoryStore(),
      network(2, [{ clientMutationId: "mutation-1" }]),
    );
    await queue.unlock("user-1");
    await queue.enqueue(draft());
    expect(await queue.sync()).toMatchObject({ pending: 0 });
  });
  it("does not replay a draft into another authenticated account", async () => {
    const queue = new EncryptedObservationQueue(new MemoryStore(), (async () =>
      json({ id: "user-2" })) as typeof fetch);
    await queue.unlock("user-1");
    await queue.enqueue(draft());
    expect(await queue.sync()).toMatchObject({
      pending: 1,
      conflict: { code: "ACCOUNT_MISMATCH" },
    });
  });
  it("keeps encrypted drafts when network fails", async () => {
    const queue = new EncryptedObservationQueue(
      new MemoryStore(),
      (async () => {
        throw new TypeError("Network unavailable");
      }) as typeof fetch,
    );
    await queue.unlock("user-1");
    await queue.enqueue(draft());
    expect(await queue.sync()).toMatchObject({
      pending: 1,
      conflict: { code: "NETWORK_UNAVAILABLE" },
    });
  });
  it("explicit clearing removes only the current account drafts and invalidates access", async () => {
    const store = new MemoryStore();
    const queue = new EncryptedObservationQueue(store);
    await queue.unlock("user-1");
    await queue.enqueue(draft());
    await queue.clear();
    expect(await store.all()).toHaveLength(0);
    await expect(queue.pending()).rejects.toMatchObject({
      code: "SESSION_LOCKED",
    });
  });
});
