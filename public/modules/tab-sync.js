export class TabCoordinator {
  constructor(onChange, name = "saturn-pkm") {
    this.id = globalThis.crypto?.randomUUID?.() || String(Math.random());
    this.onChange = onChange;
    this.channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : null;
    this.channel?.addEventListener("message", (event) => {
      if (event.data?.source !== this.id) this.onChange(event.data);
    });
    this.storageListener = (event) => {
      if (event.key?.startsWith("saturn-pkm-") && event.key !== `${name}-pulse`)
        this.onChange({ key: event.key, source: "storage-event" });
    };
    globalThis.addEventListener?.("storage", this.storageListener);
  }

  announce(key) {
    const message = { key, source: this.id, at: new Date().toISOString() };
    this.channel?.postMessage(message);
  }

  close() {
    this.channel?.close();
    globalThis.removeEventListener?.("storage", this.storageListener);
  }
}
