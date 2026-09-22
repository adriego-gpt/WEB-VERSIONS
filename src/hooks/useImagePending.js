import { useState } from "react";

export function useImagePending(source) {
  const [readySource, setReadySource] = useState("");
  return {
    pending: readySource !== source,
    markReady: () => setReadySource(source),
  };
}
