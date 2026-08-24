import React, { useEffect } from "react";
import { X, ShieldCheck, RefreshCw, FileText, Cookie, AlertTriangle, CheckCircle2 } from "lucide-react";
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
        className="modal-backdrop"
        onClick={onClose}
      >
        <Motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.97 }}
          transition={{ duration: 0.22 }}
          className="sheet legal-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Políticas y Condiciones de la Tienda"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sheet-header legal-sheet-header">
            <div className="legal-header-copy">
              <span className="legal-kicker">{brandName}</span>
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
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="legal-sheet-content">
            {tab === "exchanges" && (
              <div className="legal-body-section" tabIndex={0}>
                <div className="legal-alert-box warning">
                  <AlertTriangle size={20} className="legal-alert-icon" />
                  <div>
                    <strong>POLÍTICA ESTRICTA: SOLO CAMBIOS</strong>
                    <p>
                      En <strong>{brandName}</strong> aceptamos exclusivamente <strong>cambios directos de talla o prenda</strong>. 
                      <strong> No se realizan devoluciones ni reembolsos de dinero</strong> bajo ninguna circunstancia, ni se emite saldo a favor.
                    </p>
                  </div>
                </div>

                <div className="legal-text-block">
                  <h3>1. Condiciones para solicitar un cambio</h3>
                  <ul>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Plazo máximo:</strong> Tienes hasta <strong>7 días calendario</strong> a partir de la recepción o retiro de tu pedido para solicitar el cambio de tu prenda.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Estado de la prenda:</strong> El artículo debe estar <strong>completamente nuevo, sin uso, sin lavar y sin ningún tipo de alteración</strong>.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Etiquetas y empaque:</strong> Debe conservar todas sus etiquetas originales intactas, códigos y empaque original.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Inspección previa:</strong> No se procesará ningún cambio si la prenda presenta olores (perfume, humo, sudor), manchas (maquillaje, desodorante) o signos evidentes de haberse usado.</span>
                    </li>
                  </ul>
                </div>

                <div className="legal-text-block">
                  <h3>2. Modalidad del cambio</h3>
                  <p>
                    El cambio se realiza únicamente por:
                  </p>
                  <ul>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Cambio de talla:</strong> Del mismo modelo adquirido (sujeto a disponibilidad de inventario).</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Cambio por otra prenda:</strong> De igual valor. En caso de elegir una prenda de mayor precio, el cliente deberá cancelar la diferencia correspondiente. Si la prenda es de menor valor, deberá completar el valor con otro artículo, ya que no se realizan devoluciones de excedentes ni saldo restante.</span>
                    </li>
                  </ul>
                </div>

                <div className="legal-text-block">
                  <h3>3. Gastos de envío y flete</h3>
                  <p>
                    Los costos de envío y transporte derivados del cambio de talla o modelo son asumidos en su totalidad por el cliente comprador, a excepción de casos donde el cambio sea originado por un error atribuible a la tienda en el despacho o por un defecto de fábrica debidamente verificado.
                  </p>
                </div>
              </div>
            )}

            {tab === "privacy" && (
              <div className="legal-body-section" tabIndex={0}>
                <div className="legal-alert-box info">
                  <ShieldCheck size={20} className="legal-alert-icon" />
                  <div>
                    <strong>COMPROMISO DE CONFIDENCIALIDAD</strong>
                    <p>Tus datos personales son estrictamente privados. Nunca vendemos, alquilamos ni comercializamos tu información con terceros.</p>
                  </div>
                </div>

                <div className="legal-text-block">
                  <h3>1. Datos que recopilamos</h3>
                  <p>
                    Recopilamos únicamente la información indispensable para procesar tus compras y garantizar la entrega oportuna de tus pedidos:
                  </p>
                  <ul>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Datos de contacto e identificación:</strong> Nombre completo, número de cédula/identificación, correo electrónico y número telefónico móvil.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Datos de entrega:</strong> Dirección de envío, ciudad y referencias para el courier o repartidor.</span>
                    </li>
                  </ul>
                </div>

                <div className="legal-text-block">
                  <h3>2. Seguridad criptográfica de contraseñas</h3>
                  <p>
                    Tu contraseña se encuentra protegida mediante un proceso de cifrado unidireccional y robusto con algoritmo <strong>scrypt con sal (salt) aleatoria</strong>. Ni el personal de soporte ni los administradores de la tienda pueden visualizar ni conocer tu contraseña real.
                  </p>
                </div>

                <div className="legal-text-block">
                  <h3>3. Protección de pagos</h3>
                  <p>
                    {brandName} no almacena números de tarjetas de crédito o débito ni datos financieros sensibles. Los pagos por transferencia se verifican mediante comprobante y las pasarelas procesan las transacciones en pasarelas seguras y certificadas.
                  </p>
                </div>
              </div>
            )}

            {tab === "terms" && (
              <div className="legal-body-section" tabIndex={0}>
                <div className="legal-text-block">
                  <h3>1. Aceptación de los Términos</h3>
                  <p>
                    Al navegar en este sitio web y realizar un pedido en <strong>{brandName}</strong>, el usuario declara haber leído, comprendido y aceptado en su totalidad los presentes Términos y Condiciones de uso y compra.
                  </p>
                </div>

                <div className="legal-text-block">
                  <h3>2. Precios y Disponibilidad</h3>
                  <p>
                    Todos los precios mostrados en la tienda están expresados en dólares americanos (USD) e incluyen los detalles de oferta vigentes al momento de la orden. La disponibilidad de inventario está sujeta a existencias en tiempo real.
                  </p>
                </div>

                <div className="legal-text-block">
                  <h3>3. Procesamiento y Despacho de Pedidos</h3>
                  <p>
                    Los pedidos se preparan y despachan una vez confirmado el pago. Los tiempos de entrega comunicados son estimaciones sujetas a la logística de las empresas de courier nacionales.
                  </p>
                </div>

                <div className="legal-text-block">
                  <h3>4. Reserva de Stock</h3>
                  <p>
                    Para asegurar equidad con todos los compradores, los pedidos pendientes de pago tienen un tiempo límite para su confirmación antes de que las unidades reservadas retornen al inventario público.
                  </p>
                </div>
              </div>
            )}

            {tab === "cookies" && (
              <div className="legal-body-section" tabIndex={0}>
                <div className="legal-alert-box info">
                  <Cookie size={20} className="legal-alert-icon" />
                  <div>
                    <strong>COOKIES ESTRICTAMENTE NECESARIAS</strong>
                    <p>Utilizamos únicamente cookies técnicas indispensables para el funcionamiento y la seguridad de tu sesión de compra.</p>
                  </div>
                </div>

                <div className="legal-text-block">
                  <h3>1. ¿Qué cookies utilizamos?</h3>
                  <ul>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Cookie de Sesión (<code>atelier_user_session</code>):</strong> Mantiene tu sesión abierta de forma cifrada y segura (HTTP-only) para que puedas navegar, guardar artículos favoritos y consultar tus pedidos.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={16} className="bullet-icon" />
                      <span><strong>Cookie de Seguridad CSRF (<code>atelier_csrf_token</code>):</strong> Protege tu cuenta y tus formularios contra ataques maliciosos de falsificación de peticiones en sitios cruzados.</span>
                    </li>
                  </ul>
                </div>

                <div className="legal-text-block">
                  <h3>2. Sin Rastreadores Invasivos (Zero-PII)</h3>
                  <p>
                    En <strong>{brandName}</strong> respetamos tu privacidad. No utilizamos cookies de rastreo publicitario invasivo de terceros ni vendemos tu historial de navegación a redes de anuncios.
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
