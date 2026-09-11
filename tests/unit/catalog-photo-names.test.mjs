import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CATALOG_PHOTO_FILES,
  groupCatalogPhotoFiles,
  parseCatalogPhotoName,
  validateCatalogPhotoFiles,
} from "../../src/domain/admin/catalogPhotoNames.js";

function photo(name) {
  return { name, type: "image/png", size: 1024 };
}

test("agrupa un mismo modelo cuando sus colores tienen varias palabras", () => {
  const result = groupCatalogPhotoFiles([
    photo("clasica-azul-marino-frontal.png"),
    photo("clasica-azul-marino-perfil.png"),
    photo("clasica-verde-menta-frontal.png"),
    photo("clasica-verde-menta-posterior.png"),
  ]);

  assert.deepEqual(result.errors, []);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].name, "Clasica");
  assert.deepEqual(result.products[0].colors.map((color) => color.name), ["Azul Marino", "Verde Menta"]);
});

test("acepta separadores dobles para nombres y colores libres", () => {
  const result = parseCatalogPhotoName("chaqueta-corta__vino-tinto__frontal.png");
  assert.deepEqual(result, { ok: true, name: "Chaqueta Corta", color: "Vino Tinto", view: "Frontal" });
});

test("limita el lote antes de procesar o subir fotos", () => {
  const files = Array.from({ length: MAX_CATALOG_PHOTO_FILES + 4 }, (_, index) => photo(`modelo-${index}-negro-frontal.png`));
  const result = validateCatalogPhotoFiles(files);
  assert.equal(result.files.length, MAX_CATALOG_PHOTO_FILES);
  assert.match(result.errors[0], /máximo por lote/i);
});

test("rechaza formatos, archivos vacíos y nombres excesivos", () => {
  assert.equal(validateCatalogPhotoFiles([{ name: "foto.svg", type: "image/svg+xml", size: 100 }]).files.length, 0);
  assert.equal(validateCatalogPhotoFiles([{ name: "foto.png", type: "image/png", size: 0 }]).files.length, 0);
  assert.equal(parseCatalogPhotoName(`${"a".repeat(181)}.png`).ok, false);
});
