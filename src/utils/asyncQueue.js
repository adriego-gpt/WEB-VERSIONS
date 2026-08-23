export function enqueueAsyncOperation(queueRef, operation) {
  if (!queueRef || typeof queueRef !== "object" || typeof operation !== "function") {
    return Promise.reject(new TypeError("invalid-async-queue-operation"));
  }

  const previous = Promise.resolve(queueRef.current).catch(() => undefined);
  const queued = previous.then(() => operation());
  queueRef.current = queued.then(() => undefined).catch(() => undefined);
  return queued;
}
