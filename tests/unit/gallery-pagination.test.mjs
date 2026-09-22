import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { clampImagePan, zoomImageAtPoint } from "../../src/domain/products/imageZoom.js";
import { getCatalogPagination, DESKTOP_CATALOG_PAGE_SIZE, MOBILE_CATALOG_PAGE_SIZE } from "../../src/domain/products/catalogPagination.js";

test("zoom preserves the selected point instead of always centering the image", () => {
  const center = { x: 400, y: 350 };
  for (const point of [{ x: 400, y: 350 }, { x: 300, y: 200 }, { x: 520, y: 440 }]) {
    const pan = zoomImageAtPoint({ scale: 1, nextScale: 2.2, pan: { x: 0, y: 0 }, point, center });
    assert.ok(Math.abs(center.x + (point.x - center.x) * 2.2 + pan.x - point.x) < 0.000001);
    assert.ok(Math.abs(center.y + (point.y - center.y) * 2.2 + pan.y - point.y) < 0.000001);
  }
});

test("pinch zoom anchors correctly after the image has been panned", () => {
  const pan = zoomImageAtPoint({ scale: 2, nextScale: 3, pan: { x: 40, y: -60 }, point: { x: 250, y: 300 }, center: { x: 400, y: 350 } });
  assert.deepEqual(pan, { x: 135, y: -65 });
});

test("panning reaches all edges without moving the image completely out of view", () => {
  assert.deepEqual(clampImagePan({ x: 900, y: -900 }, 2, 400, 600), { x: 200, y: -300 });
  assert.deepEqual(clampImagePan({ x: 50, y: -75 }, 2, 400, 600), { x: 50, y: -75 });
  const reset = clampImagePan({ x: 900, y: 900 }, 1, 400, 600);
  assert.equal(Math.abs(reset.x), 0);
  assert.equal(Math.abs(reset.y), 0);
});

test("lifting the second finger after a pinch keeps the image zoomed", async () => {
  const source = await fs.readFile(new URL("../../src/components/products/ProductModal.jsx", import.meta.url), "utf8");
  const handlersSource = source.slice(
    source.indexOf("  const handlePreviewPointerDown"),
    source.indexOf("  const handlePreviewImageClick"),
  );
  const refs = {
    previewHandledByPointerRef: { current: false },
    previewDidSwipeRef: { current: false },
    previewDraggedRef: { current: false },
    previewPointersRef: { current: new Map() },
    previewPinchRef: { current: null },
    previewPinchGestureRef: { current: false },
    previewSwipeStartRef: { current: null },
    previewSwipeIntentRef: { current: null },
    previewPanStartRef: { current: null },
    previewScaleRef: { current: 1 },
    previewPanRef: { current: { x: 0, y: 0 } },
  };
  let zoomToggleCount = 0;
  const dependencies = {
    isTouchLikePointer: (type) => type === "touch" || type === "pen",
    ...refs,
    setPreviewPanning: () => {},
    clampPreviewPan: (pan, scale, element) => clampImagePan(pan, scale, element.offsetWidth, element.offsetHeight),
    setPreviewTransform: (scale, pan) => {
      refs.previewScaleRef.current = scale;
      refs.previewPanRef.current = pan;
    },
    zoomImageAtPoint,
    hasMultipleImages: false,
    goToPreviousImage: () => {},
    goToNextImage: () => {},
    togglePreviewZoom: () => { zoomToggleCount += 1; },
  };
  const { handlePreviewPointerDown, handlePreviewPointerMove, handlePreviewPointerUp } = new Function(
    ...Object.keys(dependencies),
    `${handlersSource}; return { handlePreviewPointerDown, handlePreviewPointerMove, handlePreviewPointerUp };`,
  )(...Object.values(dependencies));
  const target = {
    offsetWidth: 320,
    offsetHeight: 520,
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 520 }),
  };
  const pointer = (pointerId, clientX, clientY = 180) => ({
    pointerId,
    pointerType: "touch",
    button: 0,
    clientX,
    clientY,
    currentTarget: target,
    cancelable: true,
    preventDefault: () => {},
  });

  handlePreviewPointerDown(pointer(1, 90));
  handlePreviewPointerDown(pointer(2, 190));
  handlePreviewPointerMove(pointer(2, 310));
  assert.ok(refs.previewScaleRef.current > 2, "the pinch must increase the scale before release");
  handlePreviewPointerUp(pointer(1, 90));
  handlePreviewPointerUp(pointer(2, 310));

  assert.equal(zoomToggleCount, 0, "releasing a pinch must not be reinterpreted as a tap-to-reset");
  assert.ok(refs.previewScaleRef.current > 2, "the pinch scale must remain after both fingers lift");

  const panAfterPinch = { ...refs.previewPanRef.current };
  handlePreviewPointerDown(pointer(3, 160, 220));
  handlePreviewPointerMove(pointer(3, 220, 260));
  handlePreviewPointerUp(pointer(3, 220, 260));

  assert.notDeepEqual(refs.previewPanRef.current, panAfterPinch, "the enlarged image must pan with one finger after the pinch ends");
  assert.equal(zoomToggleCount, 0, "dragging the enlarged image must not trigger tap-to-reset");
});

test("desktop catalogue has 12 products per page and never omits or duplicates items", () => {
  assert.equal(DESKTOP_CATALOG_PAGE_SIZE, 12);
  assert.equal(MOBILE_CATALOG_PAGE_SIZE, 8);
  const items = Array.from({ length: 25 }, (_, i) => i);
  const pages = [1, 2, 3].map((page) => {
    const state = getCatalogPagination(items.length, page, DESKTOP_CATALOG_PAGE_SIZE);
    return items.slice(state.startIndex, state.endIndex);
  });
  assert.deepEqual(pages.map((page) => page.length), [12, 12, 1]);
  assert.deepEqual(pages.flat(), items);
});

test("pagination safely handles empty results, invalid pages, filters and a large catalogue", () => {
  const empty = getCatalogPagination(0, 8, 12);
  assert.equal(empty.currentPage, 1);
  assert.equal(empty.rangeStart, 0);
  assert.equal(empty.endIndex, 0);
  assert.equal(getCatalogPagination(5, 99, 12).currentPage, 1);
  assert.equal(getCatalogPagination(100, -3, 12).currentPage, 1);
  assert.equal(getCatalogPagination(100, NaN, 12).currentPage, 1);
  assert.deepEqual(getCatalogPagination(120, 6, 12).pageWindow, [4, 5, 6, 7, 8]);
  assert.deepEqual(getCatalogPagination(120, 10, 12).pageWindow, [6, 7, 8, 9, 10]);
});

test("gallery controls remain fixed and the redundant gallery message is removed", async () => {
  const [component, css] = await Promise.all([
    fs.readFile(new URL("../../src/components/products/ProductModal.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(component, /Galería del producto|product-modal-view-note|updatePreviewZoomOrigin/);
  assert.match(css, /\.carousel-arrow:hover,\s*\.carousel-arrow:active\s*\{\s*transform: none;/);
  assert.match(component, /event\.pointerType !== "mouse"/);
  assert.match(component, /previewDraggedRef\.current/);
  assert.match(component, /key="product-detail-backdrop"/);
  assert.match(component, /key="product-image-preview-backdrop"/);
  assert.match(css, /background-clip: padding-box/);
});

test("requested catalogue page is not reset while the catalogue is loading", async () => {
  const app = await fs.readFile(new URL("../../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /if \(!catalogReady\) return;\s*if \(catalogPage <= totalCatalogPages\) return;/);
  assert.doesNotMatch(app, /catalogFiltersInitializedRef/);
  assert.match(app, /if \(previousCatalogFiltersRef\.current === filters\) return;/);
});
