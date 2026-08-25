import React, { useEffect } from "react";
import { X, ShieldCheck, RefreshCw, FileText, Cookie, AlertTriangle, CheckCircle2, Ban } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";

export function LegalModal({
  open,
  tab = "exchanges",
  onTabChange,
  onClose,
  brandName = "Adriego Store",
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const tabs = [
    { id: "exchanges", label: "Cambios de Prenda", icon: RefreshCw },
    { id: "privacy", label: "Privacidad de Datos", icon: ShieldCheck },
    { id: "terms", label: "Términos de Compra", icon: FileText },
    { id: "cookies", label: "Uso de Cookies", icon: Cookie },
  ];

  return (
    <AnimatePresence>
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="modal-backdrop modal-backdrop-priority"
        onClick={onClose}
      >
        <Motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className="sheet legal-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Políticas y Condiciones de la Tienda"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="legal-sheet-header">
            <div className="legal-header-copy">
              <span className="legal-kicker">{brandName.toUpperCase()}</span>
              <h2>Políticas y Condiciones</h2>
            </div>
            <button
              type="button"
              className="icon-btn close-btn"
              onClick={onClose}
              aria-label="Cerrar modal"
            >
              <X size={18} />
            </button>
          </div>

          <div className="legal-tabs-nav" role="tablist">
            {tabs.map((item) => {
              const Icon = item.icon;
              const isActive = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`legal-tab-btn${isActive ? " active" : ""}`}
                  onClick={() => onTabChange?.(item.id)}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="legal-sheet-content">
            {tab === "exchanges" && (
              <div className="legal-body-section" tabIndex={0}>
                <div className="legal-alert-box warning">
                  <AlertTriangle size={22} className="legal-alert-icon" />
                  <div>
                    <strong>POLÍTICA ESTRICTA: SOLO CAMBIOS</strong>
                    <p>
                      En <strong>{brandName}</strong> aceptamos exclusivamente <strong>cambios directos de talla o prenda</strong>. 
                      <strong> No se realizan devoluciones ni reembolsos de dinero</strong> bajo ninguna circunstancia, ni se emite saldo a favor.
                    </p>
                  </div>
                </div>

                <div className="legal-alert-box notice">
                  <Ban size={22} className="legal-alert-icon" />
                  <div>
                    <strong>PRENDAS EN OFERTA / PROMOCIÓN: VENTA FINAL</strong>
                    <p>
                      <strong>Los productos adquiridos en oferta, descuento, promoción o liquidación NO aplican para cambios ni devoluciones.</strong> Son de venta final definitiva.
                    </p>
                  </div>
                </div>

                <div className="legal-card-section">
                  <h3>1. Condiciones para solicitar un cambio</h3>
                  <ul className="legal-list">
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Plazo máximo:</strong> Tienes hasta <strong>7 días calendario</strong> a partir de la recepción o retiro de tu pedido para solicitar el cambio de tu prenda a precio regular.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Estado de la prenda:</strong> El artículo debe estar <strong>completamente nuevo, sin uso, sin lavar y sin ningún tipo de alteración</strong>.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Etiquetas y empaque:</strong> Debe conservar todas sus etiquetas originales intactas, códigos de barra y empaque original.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Inspección previa:</strong> No se procesará ningún cambio si la prenda presenta olores (perfume, humo, sudor), manchas (maquillaje, desodorante) o signos evidentes de haberse usado.</span>
                    </li>
                  </ul>
                </div>

                <div className="legal-card-section">
                  <h3>2. Modalidad del cambio</h3>
                  <p className="legal-intro">
                    El cambio aplica únicamente para productos a precio regular y se realiza por:
                  </p>
                  <ul className="legal-list">
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Cambio de talla:</strong> Del mismo modelo adquirido (sujeto a disponibilidad de inventario).</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Cambio por otra prenda:</strong> De igual valor. Si eliges una prenda de mayor precio, se cancelará la diferencia. Si es de menor valor, se completará con otro artículo, ya que no se reembolsan excedentes ni saldo.</span>
                    </li>
                  </ul>
                </div>

                <div className="legal-card-section">
                  <h3>3. Gastos de transporte y envío</h3>
                  <p>
                    Los costos de flete y transporte derivados del cambio de talla o modelo son asumidos en su totalidad por el comprador, salvo que el cambio se deba a un error comprobado en el despacho por parte de la tienda o defecto de fábrica verificado.
                  </p>
                </div>
              </div>
            )}

            {tab === "privacy" && (
              <div className="legal-body-section" tabIndex={0}>
                <div className="legal-alert-box info">
                  <ShieldCheck size={22} className="legal-alert-icon" />
                  <div>
                    <strong>COMPROMISO DE CONFIDENCIALIDAD</strong>
                    <p>Tus datos personales son estrictamente privados. Nunca vendemos, alquilamos ni comercializamos tu información con terceros.</p>
                  </div>
                </div>

                <div className="legal-card-section">
                  <h3>1. Datos que recopilamos</h3>
                  <p className="legal-intro">
                    Recopilamos únicamente la información indispensable para procesar tus compras y garantizar la entrega oportuna de tus pedidos:
                  </p>
                  <ul className="legal-list">
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Identificación y contacto:</strong> Nombre completo, número de cédula/identificación, correo electrónico y número de teléfono celular.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Dirección de entrega:</strong> Ciudad, calle principal, secundaria y referencias para el repartidor o courier.</span>
                    </li>
                  </ul>
                </div>

                <div className="legal-card-section">
                  <h3>2. Seguridad criptográfica de contraseñas</h3>
                  <p>
                    Tu contraseña se encuentra protegida mediante un algoritmo criptográfico unidireccional <strong>scrypt con sal (salt) aleatoria</strong>. Ningún administrador ni personal de soporte puede ver tu contraseña real.
                  </p>
                </div>

                <div className="legal-card-section">
                  <h3>3. Protección y privacidad de pagos</h3>
                  <p>
                    {brandName} no almacena números de tarjetas de crédito o débito ni datos financieros sensibles. Las transferencias se validan mediante comprobante y los pagos electrónicos se gestionan en entornos seguros y certificados.
                  </p>
                </div>
              </div>
            )}

            {tab === "terms" && (
              <div className="legal-body-section" tabIndex={0}>
                <div className="legal-card-section">
                  <h3>1. Aceptación de los Términos</h3>
                  <p>
                    Al navegar en este sitio web y realizar un pedido en <strong>{brandName}</strong>, el usuario declara haber leído, comprendido y aceptado en su totalidad los presentes Términos y Condiciones de compra.
                  </p>
                </div>

                <div className="legal-card-section">
                  <h3>2. Precios y Disponibilidad</h3>
                  <p>
                    Todos los precios mostrados en la tienda están expresados en dólares americanos (USD) e incluyen los detalles de oferta vigentes al momento de la orden. La disponibilidad de inventario está sujeta a existencias en tiempo real.
                  </p>
                </div>

                <div className="legal-card-section">
                  <h3>3. Procesamiento y Despacho de Pedidos</h3>
                  <p>
                    Los pedidos se preparan y despachan una vez confirmado el pago. Los tiempos de entrega comunicados son estimaciones coordinadas con empresas de courier nacionales.
                  </p>
                </div>

                <div className="legal-card-section">
                  <h3>4. Reserva de Stock</h3>
                  <p>
                    Para asegurar disponibilidad equitativa a todos los clientes, los pedidos pendientes de confirmación de pago tienen un tiempo límite de reserva antes de retornar al catálogo público.
                  </p>
                </div>
              </div>
            )}

            {tab === "cookies" && (
              <div className="legal-body-section" tabIndex={0}>
                <div className="legal-alert-box info">
                  <Cookie size={22} className="legal-alert-icon" />
                  <div>
                    <strong>COOKIES ESTRICTAMENTE NECESARIAS</strong>
                    <p>Utilizamos únicamente cookies técnicas indispensables para el funcionamiento y la seguridad de tu sesión de compra.</p>
                  </div>
                </div>

                <div className="legal-card-section">
                  <h3>1. ¿Qué cookies utilizamos?</h3>
                  <ul className="legal-list">
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Cookie de Sesión (<code>adriego_user_session</code>):</strong> Mantiene tu sesión abierta de forma cifrada y segura (HTTP-only) para que puedas navegar, guardar artículos favoritos y consultar tus pedidos.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Cookie de Seguridad CSRF (<code>adriego_csrf_token</code>):</strong> Protege tu cuenta y tus formularios contra ataques maliciosos de falsificación de peticiones en sitios cruzados.</span>
                    </li>
                  </ul>
                </div>

                <div className="legal-card-section">
                  <h3>2. Sin Rastreadores Invasivos (Zero-PII)</h3>
                  <p>
                    En <strong>{brandName}</strong> respetamos tu privacidad. No utilizamos cookies de rastreo publicitario invasivo de terceros ni comercializamos tu historial de navegación.
                  </p>
                </div>
              </div>
            )}
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}
export default LegalModal;
