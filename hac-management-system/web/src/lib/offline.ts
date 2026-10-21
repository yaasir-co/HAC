/** Session-bound offline observation drafts. No approval decision is made offline. */
export type DraftPayload = Record<string, unknown>;
export interface OfflineObservationDraft {
  id: string;
  userId: string;
  inspectionId: string;
  expectedVersion: number;
  masterDataVersion: string;
  createdAt: string;
  payload: DraftPayload & { clientMutationId: string };
  verificationStatus: "REQUIRES_ONLINE_REVALIDATION";
}
export interface EncryptedDraft {
  id: string;
  ownerHash: string;
  createdAt: string;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
}
export interface DraftStore {
  all(): Promise<EncryptedDraft[]>;
  put(draft: EncryptedDraft): Promise<void>;
  delete(id: string): Promise<void>;
}
export interface SyncResult {
  synced: string[];
  pending: number;
  conflict?: { draftId: string; code: string; message: string };
}

export class OfflineDraftError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OfflineDraftError";
  }
}

/** Encrypted browser storage. Contains no password, session cookie, plaintext draft, or key. */
export class IndexedDbDraftStore implements DraftStore {
  private connection?: Promise<IDBDatabase>;
  private open(): Promise<IDBDatabase> {
    this.connection ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("hac-offline-drafts-v1", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("drafts", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.connection;
  }
  private async request<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("drafts", mode);
      const request = run(transaction.objectStore("drafts"));
      let value: T;
      request.onsuccess = () => {
        value = request.result;
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new OfflineDraftError(
              "STORAGE_ABORTED",
              "Offline storage was aborted.",
            ),
        );
    });
  }
  all() {
    return this.request("readonly", (store) => store.getAll()) as Promise<
      EncryptedDraft[]
    >;
  }
  async put(draft: EncryptedDraft) {
    await this.request("readwrite", (store) => store.put(draft));
  }
  async delete(id: string) {
    await this.request("readwrite", (store) => store.delete(id));
  }
}

export class EncryptedObservationQueue {
  private key: CryptoKey | null = null;
  private userId: string | null = null;
  private ownerHash: string | null = null;
  private flushing = false;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  constructor(
    private readonly store: DraftStore,
    private readonly send: typeof fetch = fetch,
  ) {}

  /** Call only after GET /auth/me has confirmed this user. Keys stay in memory for this tab. */
  async unlock(userId: string): Promise<void> {
    if (!userId)
      throw new OfflineDraftError(
        "AUTH_REQUIRED",
        "An authenticated user is required.",
      );
    if (this.userId === userId && this.key) return;
    this.lock();
    this.userId = userId;
    this.ownerHash = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", this.encoder.encode(userId)),
      ),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    this.key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  /** Lock on logout/auth failure. Existing ciphertext is inaccessible once this key is gone. */
  lock(): void {
    this.key = null;
    this.userId = null;
    this.ownerHash = null;
  }
  private session(): { key: CryptoKey; userId: string; ownerHash: string } {
    if (!this.key || !this.userId || !this.ownerHash)
      throw new OfflineDraftError(
        "SESSION_LOCKED",
        "Sign in before opening offline drafts.",
      );
    return { key: this.key, userId: this.userId, ownerHash: this.ownerHash };
  }
  private async decode(
    envelope: EncryptedDraft,
  ): Promise<OfflineObservationDraft> {
    const { key, ownerHash } = this.session();
    if (envelope.ownerHash !== ownerHash)
      throw new OfflineDraftError(
        "ACCOUNT_MISMATCH",
        "This draft belongs to another account.",
      );
    try {
      const plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: envelope.iv,
          additionalData: this.encoder.encode(
            `hac-offline/v1:${ownerHash}:${envelope.id}`,
          ),
        },
        key,
        envelope.ciphertext,
      );
      return JSON.parse(
        this.decoder.decode(plaintext),
      ) as OfflineObservationDraft;
    } catch {
      throw new OfflineDraftError(
        "KEY_UNAVAILABLE",
        "Offline drafts cannot be decrypted in this tab session. Keep the original tab open until synchronization; signing out or reloading loses the memory key.",
      );
    }
  }
  async count(): Promise<number> {
    const { ownerHash } = this.session();
    return (await this.store.all()).filter(
      (draft) => draft.ownerHash === ownerHash,
    ).length;
  }
  async pending(): Promise<OfflineObservationDraft[]> {
    const { ownerHash } = this.session();
    const envelopes = (await this.store.all())
      .filter((draft) => draft.ownerHash === ownerHash)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const decoded = await Promise.all(
      envelopes.map((envelope) => this.decode(envelope)),
    );
    return decoded.sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) ||
        a.inspectionId.localeCompare(b.inspectionId) ||
        a.expectedVersion - b.expectedVersion,
    );
  }
  async enqueue(input: {
    inspectionId: string;
    expectedVersion: number;
    masterDataVersion: string;
    payload: DraftPayload;
  }): Promise<OfflineObservationDraft> {
    const { key, userId, ownerHash } = this.session();
    if (
      !input.inspectionId ||
      !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion < 1 ||
      !input.masterDataVersion
    )
      throw new OfflineDraftError(
        "INVALID_DRAFT",
        "Inspection, cached version, and HAC data version are required.",
      );
    const pending = await this.pending();
    const mutationId =
      typeof input.payload.clientMutationId === "string" &&
      input.payload.clientMutationId.length > 0
        ? input.payload.clientMutationId
        : crypto.randomUUID();
    const existing = pending.find(
      (draft) => draft.payload.clientMutationId === mutationId,
    );
    if (existing) return existing;
    const nextVersion = pending
      .filter((draft) => draft.inspectionId === input.inspectionId)
      .reduce(
        (version, draft) => Math.max(version, draft.expectedVersion + 1),
        input.expectedVersion,
      );
    const draft: OfflineObservationDraft = {
      id: crypto.randomUUID(),
      userId,
      inspectionId: input.inspectionId,
      expectedVersion: nextVersion,
      masterDataVersion: input.masterDataVersion,
      createdAt: new Date().toISOString(),
      payload: { ...input.payload, clientMutationId: mutationId },
      verificationStatus: "REQUIRES_ONLINE_REVALIDATION",
    };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: this.encoder.encode(
          `hac-offline/v1:${ownerHash}:${draft.id}`,
        ),
      },
      key,
      this.encoder.encode(JSON.stringify(draft)),
    );
    await this.store.put({
      id: draft.id,
      ownerHash,
      createdAt: draft.createdAt,
      iv: iv.buffer,
      ciphertext,
    });
    return draft;
  }

  /** Stops on conflict, expired login, or network failure. Submission is always an online action. */
  async sync(): Promise<SyncResult> {
    const { userId } = this.session();
    if (this.flushing)
      throw new OfflineDraftError(
        "SYNC_IN_PROGRESS",
        "Draft synchronization is already running.",
      );
    this.flushing = true;
    const synced: string[] = [];
    let activeId = "";
    const failure = async (
      code: string,
      message: string,
    ): Promise<SyncResult> => ({
      synced,
      pending: (await this.pending()).length,
      conflict: { draftId: activeId, code, message },
    });
    try {
      const login = await this.send("/api/v1/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!login.ok)
        return failure("AUTH_REQUIRED", "Sign in again before synchronizing.");
      const current = (await login.json()) as { data: { id: string } };
      if (current.data.id !== userId)
        return failure(
          "ACCOUNT_MISMATCH",
          "The signed-in account does not own these drafts.",
        );
      for (const draft of await this.pending()) {
        activeId = draft.id;
        const response = await this.send(
          `/api/v1/inspections/${encodeURIComponent(draft.inspectionId)}`,
          { credentials: "same-origin", cache: "no-store" },
        );
        if (!response.ok)
          return failure(
            "INSPECTION_UNAVAILABLE",
            "The assigned inspection is unavailable.",
          );
        const { data: inspection } = (await response.json()) as {
          data: {
            version: number;
            status: string;
            observations?: Array<{ clientMutationId: string }>;
          };
        };
        // A prior request may have committed before its response was lost.
        if (
          inspection.observations?.some(
            (observation) =>
              observation.clientMutationId === draft.payload.clientMutationId,
          )
        ) {
          await this.store.delete(draft.id);
          synced.push(draft.id);
          continue;
        }
        if (inspection.status !== "IN_PROGRESS")
          return failure(
            "INSPECTION_LOCKED",
            "This inspection is no longer an editable draft.",
          );
        if (inspection.version !== draft.expectedVersion)
          return failure(
            "VERSION_CONFLICT",
            "The inspection changed after download. Review and reconcile this draft online.",
          );
        const saved = await this.send(
          `/api/v1/inspections/${encodeURIComponent(draft.inspectionId)}/observations`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...draft.payload,
              version: draft.expectedVersion,
            }),
          },
        );
        if (!saved.ok) {
          const result = (await saved.json().catch(() => ({}))) as {
            error?: { code?: string; message?: string };
          };
          return failure(
            result.error?.code ?? "SYNC_REJECTED",
            result.error?.message ??
              "Server validation rejected the queued observation.",
          );
        }
        await this.store.delete(draft.id);
        synced.push(draft.id);
      }
      return { synced, pending: (await this.pending()).length };
    } catch (error) {
      if (error instanceof OfflineDraftError) throw error;
      return failure(
        "NETWORK_UNAVAILABLE",
        "Synchronization paused. Drafts remain encrypted in this browser; retry when connected.",
      );
    } finally {
      this.flushing = false;
    }
  }
  /** Explicitly discard this user's queued drafts, then remove the session key. */
  async clear(): Promise<void> {
    const { ownerHash } = this.session();
    for (const envelope of await this.store.all())
      if (envelope.ownerHash === ownerHash)
        await this.store.delete(envelope.id);
    this.lock();
  }
}

let browserQueue: EncryptedObservationQueue | undefined;
function instance() {
  browserQueue ??= new EncryptedObservationQueue(new IndexedDbDraftStore());
  return browserQueue;
}
export const unlockOfflineSession = (userId: string) =>
  instance().unlock(userId);
export const queueObservation = (
  draft: Parameters<EncryptedObservationQueue["enqueue"]>[0],
) => instance().enqueue(draft);
export const pendingDrafts = () => instance().pending();
export const pendingDraftCount = () => instance().count();
export const syncQueuedObservations = () => instance().sync();
export const clearOfflineSession = () => instance().clear();
export const lockOfflineSession = () => instance().lock();
