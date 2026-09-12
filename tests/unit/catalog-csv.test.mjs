import test from "node:test";
import assert from "node:assert/strict";
import { catalogToCsv, parseCatalogCsv } from "../../src/domain/admin/catalogCsv.js";

const header = "sku,nombre,precio,precio_anterior,categoria,tipo,descripcion,tags,publico,destacado,nuevo,color,talla,stock,imagen_url";

test("importar solo precio y stock conserva los campos opcionales del producto existente", () => {
  const existing = [{ id: "p1", sku: "A", name: "Abrigo", category: "Mujer", productType: "Cortas", description: "Original", isPublic: true, featured: true, newArrival: true, filterTags: ["Invierno"], imagesByColor: { Azul: ["https://example.com/a.jpg"] }, imageViewsByColor: { Azul: ["Frontal"] }, variants: [] }];
  const result = parseCatalogCsv("sku,nombre,precio,color,talla,stock\nA,Abrigo,35,Azul,M,2", existing);
  assert.deepEqual(result.errors, []);
  for (const field of ["category", "productType", "description", "isPublic", "featured", "newArrival", "filterTags", "imagesByColor", "imageViewsByColor"]) assert.deepEqual(result.products[0][field], existing[0][field], field);
});

test("stock vacío o fraccionario requiere corrección en lugar de convertirse silenciosamente", () => {
  for (const stock of ["", "1.5"]) {
    const result = parseCatalogCsv(`nombre,precio,color,talla,stock\nAbrigo,35,Azul,M,${stock}`);
    assert.ok(result.errors.length > 0, `stock inválido: ${stock}`);
  }
});

test("un mismo SKU con precios o nombres contradictorios no importa la primera fila silenciosamente", () => {
  for (const row of ["A,Abrigo,40,Azul,L,2", "A,Otro modelo,35,Azul,L,2"]) {
    const result = parseCatalogCsv(`sku,nombre,precio,color,talla,stock\nA,Abrigo,35,Azul,M,2\n${row}`);
    assert.ok(result.errors.length > 0);
  }
});

test("un SKU diferente no sobrescribe por coincidencia de nombre", () => {
  const result = parseCatalogCsv("sku,nombre,precio,color,talla,stock\nB,Abrigo,35,Azul,M,2", [{id:"p1",sku:"A",name:"Abrigo"}]);
  assert.ok(result.errors.length > 0);
});

test("colores con claves reservadas se rechazan sin bloquear el importador", () => {
  for (const color of ["__proto__", "constructor", "toString"]) {
    const result = parseCatalogCsv(`nombre,precio,color,talla,stock\nAbrigo,35,${color},M,2`);
    assert.ok(result.errors.length > 0);
  }
});

test("parseCatalogCsv agrupa variantes y respeta publico=no", () => {
  const csv = `${header}\r\nCAM-001,Camisa lino,29.9,,Mujer,Camisas,Ligera,verano;oficina,no,si,no,Negro,S,3,https://example.com/negro.jpg\r\nCAM-001,Camisa lino,29.9,,Mujer,Camisas,Ligera,verano;oficina,no,si,no,Negro,M,0,https://example.com/negro.jpg`;
  const result = parseCatalogCsv(csv, []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].variants.length, 2);
  assert.equal(result.products[0].isPublic, false);
  assert.equal(result.products[0].stockBySize.M, 0);
});

test("parseCatalogCsv actualiza por SKU sin duplicar el producto", () => {
  const existing = [{ id: "existing-1", sku: "CAM-001", name: "Camisa anterior", variants: [] }];
  const csv = `${header}\r\nCAM-001,Camisa nueva,35,,Mujer,Camisas,,,si,no,no,Azul,M,4,`;
  const result = parseCatalogCsv(csv, existing);
  assert.deepEqual(result.errors, []);
  assert.equal(result.products[0].id, "existing-1");
  assert.equal(result.summary.creates, 0);
});

test("parseCatalogCsv rechaza stock negativo, variantes repetidas y URLs inseguras", () => {
  const negative = parseCatalogCsv(`${header}\r\nA,Producto,10,,,,,,no,no,no,Negro,M,-1,`, []);
  assert.match(negative.errors[0], /Fila 2/);

  const repeated = parseCatalogCsv(`${header}\r\nA,Producto,10,,,,,,no,no,no,Negro,M,1,\r\nA,Producto,10,,,,,,no,no,no,Negro,M,2,`, []);
  assert.match(repeated.errors.at(-1), /repetida/);

  const insecure = parseCatalogCsv(`${header}\r\nA,Producto,10,,,,,,no,no,no,Negro,M,1,http://example.com/a.jpg`, []);
  assert.match(insecure.errors.at(-1), /https:\/\//);
});

test("catalogToCsv conserva campos con comas y comillas", () => {
  const csv = catalogToCsv([{ id: "1", sku: "A", name: 'Blusa "Lino", natural', basePrice: 20, isPublic: false, colors: ["Crudo"], sizes: ["M"], variants: [{ color: "Crudo", size: "M", stock: 0 }], imagesByColor: {} }]);
  assert.match(csv, /"Blusa ""Lino"", natural"/);
  const result = parseCatalogCsv(csv, []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.products[0].name, 'Blusa "Lino", natural');
});

test("catalogToCsv conserva oferta, calificación, swatch y todas las imágenes", () => {
  const original = [{
    id: "1", sku: "A", name: "Blusa", basePrice: 30, oldPrice: 40, rating: 4.7,
    offerEnabled: true, offerDiscountMode: "percent", offerDiscountValue: 25,
    isPublic: true, colors: ["Crudo"], sizes: ["M"],
    variants: [{ color: "Crudo", size: "M", stock: 2 }],
    colorSwatches: { Crudo: "#e8dfcf" },
    imagesByColor: { Crudo: ["https://example.com/1.jpg", "https://example.com/2.jpg"] },
  }];
  const result = parseCatalogCsv(catalogToCsv(original), []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.products[0].rating, 4.7);
  assert.equal(result.products[0].offerEnabled, true);
  assert.equal(result.products[0].offerDiscountValue, 25);
  assert.equal(result.products[0].colorSwatches.Crudo, "#e8dfcf");
  assert.deepEqual(result.products[0].imagesByColor.Crudo, ["https://example.com/1.jpg", "https://example.com/2.jpg"]);
});

test("parseCatalogCsv rechaza límites finales del catálogo", () => {
  const rows = Array.from({ length: 121 }, (_, index) => `A,Producto,10,,,,,,no,no,no,Negro,T${index},1,`).join("\r\n");
  const tooManyVariants = parseCatalogCsv(`${header}\r\n${rows}`, []);
  assert.ok(tooManyVariants.errors.some((error) => /120 variantes/.test(error)));

  const existing = Array.from({ length: 250 }, (_, index) => ({ id: `p-${index}`, sku: `P-${index}`, name: `Producto ${index}` }));
  const tooManyProducts = parseCatalogCsv(`${header}\r\nNEW,Nuevo,10,,,,,,no,no,no,Negro,M,1,`, existing);
  assert.ok(tooManyProducts.errors.some((error) => /máximo 250/.test(error)));
});

test("parseCatalogCsv admite alias de encabezado y valores flexibles para destacados", () => {
  const csv1 = "sku,nombre,precio,destacados,color,talla,stock\nDEST-01,Vestido Fiesta,89,si,Rojo,M,5\nDEST-02,Vestido Gala,99,destacado,Negro,S,3";
  const result1 = parseCatalogCsv(csv1, []);
  assert.deepEqual(result1.errors, []);
  assert.equal(result1.products[0].featured, true);
  assert.equal(result1.products[1].featured, true);

  const existing = [{ id: "p-ext", sku: "DEST-EXT", name: "Vestido Existente", featured: false, variants: [] }];
  const csv2 = "sku,nombre,precio,destacados,color,talla,stock\nDEST-EXT,Vestido Existente,89,destacados,Azul,M,4";
  const result2 = parseCatalogCsv(csv2, existing);
  assert.deepEqual(result2.errors, []);
  assert.equal(result2.products[0].featured, true);
});

