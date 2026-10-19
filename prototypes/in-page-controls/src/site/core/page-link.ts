// THROWAWAY PROTOTYPE (ticket 14; ticket 17's site/core/page-link and §6.1). The isolated side of the page channel:
// CustomEvents with JSON-string details. A job about an item is dispatched on that item's element.
export type Snapshot = { signedIn: boolean; pageType: string; videoId: string | null };

export function createPageLink() {
  let seq = 0;
  const pending = new Map<number, (r: unknown) => void>();
  const streams = new Map<number, (d: any) => void>();
  const onRes = (e: Event) => {
    const msg = JSON.parse((e as CustomEvent<string>).detail);
    if (msg.type === "stream") streams.get(msg.id)?.(msg.data);
    else {
      pending.get(msg.id)?.(msg.result);
      pending.delete(msg.id);
    }
  };
  document.addEventListener("ppt:res", onRes);
  const send = (msg: object, target: EventTarget = document) =>
    target.dispatchEvent(new CustomEvent("ppt:req", { detail: JSON.stringify(msg), bubbles: true, composed: true }));

  return {
    run<T = unknown>(job: { job: string; [k: string]: unknown }, opts: { target?: Element } = {}): Promise<T> {
      const id = ++seq;
      return new Promise<T>((resolve) => {
        const t = setTimeout(() => {
          pending.delete(id);
          resolve({ error: "timeout" } as T);
        }, 10_000);
        pending.set(id, (r) => {
          clearTimeout(t);
          resolve(r as T);
        });
        send({ type: "run", id, job }, opts.target);
      });
    },
    watch(stream: string, cb: (d: any) => void): () => void {
      const id = ++seq;
      streams.set(id, cb);
      send({ type: "watch", id, stream });
      return () => {
        streams.delete(id);
        send({ type: "unwatch", id });
      };
    },
    dispose() {
      document.removeEventListener("ppt:res", onRes);
    },
  };
}
export type PageLink = ReturnType<typeof createPageLink>;
