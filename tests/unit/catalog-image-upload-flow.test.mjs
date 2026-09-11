import assert from "node:assert/strict";
import test from "node:test";
import { uploadCatalogImageFiles } from "../../src/domain/admin/catalogImageUpload.js";

test("catalog image upload flow keeps successful uploads when one file fails", async () => {
  const files = [{ name: "front.jpg" }, { name: "broken.heic" }, { name: "back.png" }];
  const progress = [];

  const result = await uploadCatalogImageFiles(files, {
    uploadOne: async (file) => {
      if (file.name.endsWith(".heic")) throw new Error("Formato no compatible");
      return `https://store.public.blob.vercel-storage.com/${file.name}`;
    },
    onProgress: (state) => progress.push(state),
  });

  assert.deepEqual(result.urls, [
    "https://store.public.blob.vercel-storage.com/front.jpg",
    "https://store.public.blob.vercel-storage.com/back.png",
  ]);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].fileName, "broken.heic");
  assert.equal(progress.at(-1).completed, 3);
  assert.equal(progress.at(-1).succeeded, 2);
});

test("catalog image upload flow rejects an empty selection deterministically", async () => {
  const result = await uploadCatalogImageFiles([], { uploadOne: async () => "unused" });
  assert.deepEqual(result, { urls: [], failures: [] });
});

test("catalog image upload flow abandons a request that never finishes", async () => {
  const startedAt = Date.now();
  const result = await Promise.race([
    uploadCatalogImageFiles([{ name: "stalled.jpg" }], {
      uploadOne: () => new Promise(() => {}),
      timeoutMs: 20,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("La carga siguió pendiente")), 150)),
  ]);

  assert.equal(result.urls.length, 0);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].message, /tiempo de espera/i);
  assert.ok(Date.now() - startedAt < 250);
});
