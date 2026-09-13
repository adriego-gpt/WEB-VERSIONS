// Keep input math synchronous, but commit only the latest visual update per frame.
export function createFrameQueue(apply, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame) {
  let frame = null;
  let latest;
  return {
    push(value) {
      latest = value;
      if (frame !== null) return;
      frame = requestFrame(() => {
        frame = null;
        apply(latest);
      });
    },
    cancel() {
      if (frame !== null) cancelFrame(frame);
      frame = null;
      latest = undefined;
    },
  };
}
