# Sistema de Diseño y Tokens CSS — Adriego Store

Este documento detalla el sistema de tokens CSS, las decisiones de accesibilidad, la consolidación de media queries y el comportamiento responsive de **Adriego Store**.

---

## 1. Tokens Base (`:root`)

### Colores Semánticos
| Token | Valor | Uso |
|---|---|---|
| `--bg-soft` | `#f2efe9` | Fondo general suave |
| `--bg-card` | `#ffffff` | Fondo de tarjetas |
| `--surface-elevated` | `#ffffff` | Superficies elevadas |
| `--surface-muted` | `#f7f5f0` | Fondo secundario |
| `--surface-glass` | `rgba(255,255,255,0.86)` | Superficies translúcidas |
| `--text-main` | `#151515` | Texto principal |
| `--text-muted` | `#55555c` | Texto secundario |
| `--text-strong` | `#0f1012` | Texto de alto contraste |
| `--brand-primary` | `#12151b` | Marca principal |
| `--brand-accent` | `#c57a45` | Acento dorado |
| `--line-soft` | `rgba(0,0,0,0.08)` | Bordes suaves |
| `--line-strong` | `rgba(0,0,0,0.16)` | Bordes pronunciados |

### Espaciados
| Token | Valor |
|---|---|
| `--space-xs` | `4px` |
| `--space-sm` | `8px` |
| `--space-md` | `16px` |
| `--space-lg` | `24px` |
| `--space-xl` | `32px` |
| `--space-2xl` | `48px` |

### Radios
| Token | Valor |
|---|---|
| `--radius-sm` | `14px` |
| `--radius-md` | `20px` |
| `--radius-lg` | `28px` |
| `--radius-xl` | `34px` |
| `--radius-full` | `999px` |

### Sombras
| Token | Valor |
|---|---|
| `--shadow-xs` | `0 6px 16px rgba(0,0,0,0.06)` |
| `--shadow-sm` | `0 10px 28px rgba(0,0,0,0.08)` |
| `--shadow-md` | `0 18px 40px rgba(0,0,0,0.1)` |
| `--shadow-lg` | `0 22px 52px rgba(0,0,0,0.14)` |
| `--ring-soft` | `0 0 0 3px rgba(17,17,17,0.08)` |

### Movimiento
| Token | Valor | Nota |
|---|---|---|
| `--time-fast` | `180ms` (140ms en ≤760px) | Interacciones rápidas |
| `--time-base` | `240ms` (190ms en ≤760px) | Transiciones estándar |
| `--ease-standard` | `cubic-bezier(0.22,1,0.36,1)` | Curva de animación |

---

## 2. Accesibilidad

### Objetivos Táctiles (WCAG 2.2 AA)
- **Regla base**: Todo `.btn`, `.icon-btn`, `.icon-quick-btn` tiene `min-height: 44px`.
- **Elementos pequeños** (`.dot`, `.hero-slide-dot`, `.qty-control-btn`, `.icon-btn`): Tienen un pseudo-elemento `::after` invisible de 44×44px como área de toque expandida.
- **Chips**: `min-height: 44px` en desktop; se adaptan con área táctil expandida en móvil.

### Foco Visible
- **Anillo de foco**: `outline: 2px solid var(--brand-accent); outline-offset: 2px; box-shadow: var(--ring-soft)` para `.btn`, `.icon-btn`, `.icon-quick-btn`, `.chip`, `.nav-links a` y `.product-image-main-btn`.
- **Modales**: Los botones de zoom e imagen dentro de modales usan el mismo anillo de alto contraste.

### Movimiento Reducido
- `@media (prefers-reduced-motion: reduce)`: Desactiva animaciones y transiciones a `1ms`.
- `@media (hover: none)`: Desactiva transformaciones hover y pulso de stock bajo.

---

## 3. Comportamiento Responsive y Breakpoints Consolidados

Los media queries duplicados y fragmentados han sido unificados en un único bloque por breakpoint en orden estricto de cascada descendente (`max-width`):

| Breakpoint | Tipo | Cambios Principales |
|---|---|---|
| **1440px+** | Desktop amplio | Contenedor `max-width: 1280px` centrado |
| **1180px** | Desktop/Tablet grande | Grids hero/admin/footer a 1 columna; usuarios admin responsivos |
| **1024px** | Desktop (`min-width`) | Textura de fondo SVG noise |
| **980px** | Tablet landscape | Nav se envuelve en filas; grids a 2 columnas |
| **760px** | Tablet/Móvil grande (Consolidado) | Navegación inferior fija; modal a pantalla completa (`100dvh`); sheets `100dvh`; administración adaptable |
| **560px** | Móvil (Consolidado) | Grids carrusel horizontal; catálogo a 2 columnas sin recorte; variantes compactas |
| **420px** | Móvil pequeño (Consolidado) | Layouts de carrito compactos; thumbs reducidos; cupones fluidos |
| **380px** | Ultra-pequeño | Modal left 250px; cards 68-78vw |
| **340px** | Pantalla muy estrecha | Container 12px margen; hero 220px; filtros y acciones secundarias en 1 columna |

### Correcciones de Overflow y Superposición
- **Sin página blanca**: Renderizado validado con 0 errores de referencia.
- **Sin scroll horizontal**: `overflow-x: hidden` y safe widths en todos los contenedores y grids.
- **Sin solapamiento**: Barra inferior fija (`bottom: 10px`), toasts reubicados arriba de la barra (`bottom: calc(90px + env(safe-area-inset-bottom))`), modales con `overflow-y: auto` y altura dinámica `dvh`.
- **Catálogo en móvil**: Conserva estrictamente las dos columnas (`grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px !important;`) con aspect-ratio 1:1 en imágenes, evitando recortes.

### Zoom al 200%
- Textos críticos usan `overflow-wrap: anywhere; word-break: break-word; hyphens: auto`.
- Precios usan `font-variant-numeric: tabular-nums; white-space: nowrap`.
