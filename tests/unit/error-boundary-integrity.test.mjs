import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("ErrorBoundary and Error Preview Route Integrity", async (t) => {
  const ebContent = fs.readFileSync("src/components/ui/ErrorBoundary.jsx", "utf8");
  const appContent = fs.readFileSync("src/App.jsx", "utf8");
  const cssContent = fs.readFileSync("src/App.css", "utf8");

  await t.test("1. ErrorBoundary explicitly imports all required lucide icons", () => {
    const requiredIcons = ["RefreshCw", "Home", "MessageCircle", "ShieldCheck", "ChevronDown", "ChevronUp"];
    for (const icon of requiredIcons) {
      assert.ok(
        ebContent.includes(icon),
        `ErrorBoundary must import and use ${icon}`
      );
    }
  });

  await t.test("2. ErrorBoundary shields title and message props with String() to prevent object-render crash", () => {
    assert.ok(
      ebContent.includes("String(this.props.title"),
      "ErrorBoundary must wrap this.props.title in String() to prevent object-render crash"
    );
    assert.ok(
      ebContent.includes("String(this.props.message"),
      "ErrorBoundary must wrap this.props.message in String() to prevent object-render crash"
    );
  });

  await t.test("3. ErrorBoundary restricts stack traces to development environment only", () => {
    assert.ok(
      ebContent.includes("import.meta.env.DEV && this.state.error"),
      "Technical details stack trace must only render when import.meta.env.DEV is true"
    );
  });

  await t.test("4. ErrorBoundary provides Haute Couture silhouette SVG illustration and quote", () => {
    assert.ok(
      ebContent.includes("AtelierFashionIllustration"),
      "ErrorBoundary must include the Atelier Fashion Illustration component"
    );
    assert.ok(
      ebContent.includes("Audrey Hepburn"),
      "ErrorBoundary quote must cite Audrey Hepburn"
    );
    assert.ok(
      ebContent.includes("atelier-silhouette-svg"),
      "Illustration must include the atelier silhouette SVG element"
    );
  });

  await t.test("5. ErrorBoundary includes safety badge and action buttons with accessible labels", () => {
    assert.ok(
      ebContent.includes("Carrito y preferencias seguros"),
      "Safety reassurance badge text must be present"
    );
    assert.ok(
      ebContent.includes("Reanudar Navegación"),
      "Primary reload button label must be present"
    );
    assert.ok(
      ebContent.includes("Volver al Inicio") || ebContent.includes("Volver"),
      "Secondary navigation button must be present"
    );
    assert.ok(
      ebContent.includes("Asistencia personalizada por WhatsApp"),
      "WhatsApp concierge support link must be present"
    );
  });

  await t.test("6. App.jsx defines openCatalogSearch BEFORE all useEffect hooks to prevent TDZ ReferenceError", () => {
    const openCatalogPos = appContent.indexOf("const openCatalogSearch = useCallback");
    const firstPathnameEffectPos = appContent.indexOf('normalizedPathname === "/carrito"');

    assert.ok(openCatalogPos > 0, "openCatalogSearch must be declared with useCallback");
    assert.ok(firstPathnameEffectPos > 0, "pathname useEffect must exist in App.jsx");
    assert.ok(
      openCatalogPos < firstPathnameEffectPos,
      "openCatalogSearch MUST be defined BEFORE the pathname useEffect to prevent Temporal Dead Zone ReferenceError"
    );
  });

  await t.test("7. App.jsx defines KNOWN_DIRECT_ROUTES at module level and includes /error-preview", () => {
    assert.ok(
      appContent.includes("const KNOWN_DIRECT_ROUTES = new Set("),
      "KNOWN_DIRECT_ROUTES must be declared at module level"
    );
    assert.ok(
      appContent.includes('"/error-preview"'),
      "KNOWN_DIRECT_ROUTES must include /error-preview"
    );
  });

  await t.test("8. App.jsx uses ErrorPreviewThrower with componentDidMount (not throw during render)", () => {
    assert.ok(
      appContent.includes("class ErrorPreviewThrower extends React.Component"),
      "ErrorPreviewThrower class component must exist"
    );
    assert.ok(
      appContent.includes("componentDidMount()"),
      "ErrorPreviewThrower must throw in componentDidMount, never inside render()"
    );
  });

  await t.test("9. CSS includes atelier-error styles with responsive and prefers-reduced-motion rules", () => {
    assert.ok(cssContent.includes(".atelier-error-wrapper"), "CSS must contain .atelier-error-wrapper");
    assert.ok(cssContent.includes(".atelier-error-card"), "CSS must contain .atelier-error-card");
    assert.ok(cssContent.includes(".atelier-btn-primary"), "CSS must contain .atelier-btn-primary");
    assert.ok(cssContent.includes(".atelier-btn-secondary"), "CSS must contain .atelier-btn-secondary");
    assert.ok(cssContent.includes("prefers-reduced-motion"), "CSS must contain prefers-reduced-motion rule for error screen");
  });
});
