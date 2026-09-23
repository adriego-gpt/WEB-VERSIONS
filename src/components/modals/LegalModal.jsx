import React from "react";
import { X, ShieldCheck, RefreshCw, FileText, Cookie, AlertTriangle, CheckCircle2, Ban } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { useModalA11y } from "../../hooks/useModalA11y";
import { useOverlayHistory } from "../../hooks/useOverlayHistory";
import { normalizeSafeUrl } from "../../utils/url.js";
import { normalizeWhatsAppInternationalNumber } from "../../utils/phone.js";

const tabs = [
  { id: "exchanges", label: "Cambios de prenda", icon: RefreshCw },
  { id: "privacy", label: "Privacidad", icon: ShieldCheck },
  { id: "terms", label: "Términos de compra", icon: FileText },
  { id: "cookies", label: "Cookies", icon: Cookie },
];

function Section({ title, children }) {
  return <section className="legal-card-section"><h3>{title}</h3>{children}</section>;
}

export function LegalModal({ open, tab = "exchanges", onTabChange, onClose, brandName = "Adriego Store", contactSettings = {} }) {
  const containerRef = useModalA11y(open, onClose);
  useOverlayHistory({ open, onClose, step: tab, onStepChange: onTabChange });
  if (!open) return null;
  const currentTab = tabs.some((item) => item.id === tab) ? tab : "exchanges";
  const phone = normalizeWhatsAppInternationalNumber(contactSettings.whatsappNumber || contactSettings.phone || "");
  const whatsapp = phone ? `https://wa.me/${phone}` : normalizeSafeUrl(contactSettings.whatsappLink);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactSettings.email || "") ? contactSettings.email : "";
  const legalAddress = contactSettings.legalAddress || contactSettings.address;
  const contact = <div className="legal-contact-links">{email && <a href={`mailto:${email}`}>{email}</a>}{whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer">Contactar por WhatsApp</a>}{!email && !whatsapp && <p>Utiliza los canales de atención publicados en la tienda.</p>}</div>;
  return (
    <AnimatePresence>
      <Motion.div className="modal-backdrop modal-backdrop-priority" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <Motion.div ref={containerRef} className="sheet legal-sheet" role="dialog" aria-modal="true" aria-labelledby="legal-title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2 }} onClick={(event) => event.stopPropagation()}>
          <div className="legal-sheet-header"><div className="legal-header-copy"><h2 id="legal-title">Políticas y condiciones</h2><p className="legal-updated">{brandName} · Actualizadas el 22 de septiembre de 2026</p></div><button type="button" className="icon-btn close-btn" onClick={onClose} aria-label="Cerrar políticas"><X size={18} /></button></div>
          <div className="legal-tabs-nav" role="tablist" aria-label="Documentos de la tienda">
            {tabs.map(({ id, label, icon }) => { const Icon = icon; return <button key={id} type="button" role="tab" id={`legal-tab-${id}`} aria-controls={`legal-tabpanel-${id}`} aria-selected={currentTab === id} tabIndex={currentTab === id ? 0 : -1} className={`legal-tab-btn${currentTab === id ? " active" : ""}`} onClick={() => onTabChange?.(id)} onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const index = tabs.findIndex((item) => item.id === id);
              const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
              onTabChange?.(tabs[next].id);
              document.getElementById(`legal-tab-${tabs[next].id}`)?.focus();
            }}><Icon size={15} aria-hidden="true" /><span>{label}</span></button>; })}
          </div>
          <div className="legal-sheet-content" role="tabpanel" tabIndex={0} id={`legal-tabpanel-${currentTab}`} aria-labelledby={`legal-tab-${currentTab}`}>
            <div className="legal-body-section">
              {currentTab === "exchanges" && <>
                <div className="legal-alert-box warning"><AlertTriangle size={22} className="legal-alert-icon" aria-hidden="true" /><div><strong>POLÍTICA COMERCIAL: SOLO CAMBIOS</strong><p>En <strong>{brandName}</strong> aceptamos <strong>cambios directos de talla o prenda</strong> a precio regular. <strong>No ofrecemos devoluciones voluntarias ni reembolsos comerciales de dinero</strong>, ni emitimos saldo a favor. Se mantienen las excepciones legales indicadas al final.</p></div></div>
                <div className="legal-alert-box notice"><Ban size={22} className="legal-alert-icon" aria-hidden="true" /><div><strong>OFERTAS, REMATES Y PRENDAS ÚNICAS: VENTA FINAL</strong><p>Los productos adquiridos en oferta, descuento, promoción o liquidación, así como los remates y prendas únicas, <strong>no aplican para cambios comerciales ni devoluciones voluntarias</strong>. Revisa la talla, las medidas, el color y la descripción antes de comprar.</p></div></div>
                <Section title="1. Condiciones para solicitar un cambio"><ul className="legal-list">
                  <li><CheckCircle2 size={16} className="bullet-icon" aria-hidden="true" /><span><strong>Plazo comercial:</strong> Tienes hasta <strong>7 días calendario</strong> desde la recepción o retiro para solicitar el cambio de una prenda a precio regular. Este plazo no reduce los plazos ni derechos exigidos por ley.</span></li>
                  <li><CheckCircle2 size={16} className="bullet-icon" aria-hidden="true" /><span><strong>Estado de la prenda:</strong> Debe estar completamente nueva, sin uso, sin lavar y sin alteraciones.</span></li>
                  <li><CheckCircle2 size={16} className="bullet-icon" aria-hidden="true" /><span><strong>Etiquetas y empaque:</strong> Conserva las etiquetas originales intactas, los códigos y el empaque original.</span></li>
                  <li><CheckCircle2 size={16} className="bullet-icon" aria-hidden="true" /><span><strong>Inspección previa:</strong> Para cambios por preferencia, revisaremos que no existan olores, manchas ni signos de uso. Estas condiciones no excluyen soluciones por defectos o errores del pedido.</span></li>
                </ul></Section>
                <Section title="2. Modalidad del cambio"><p>El cambio comercial aplica únicamente para productos a precio regular y se realiza por:</p><ul className="legal-list">
                  <li><CheckCircle2 size={16} className="bullet-icon" aria-hidden="true" /><span><strong>Cambio de talla:</strong> Del mismo modelo adquirido, sujeto a disponibilidad de inventario.</span></li>
                  <li><CheckCircle2 size={16} className="bullet-icon" aria-hidden="true" /><span><strong>Cambio por otra prenda:</strong> De igual valor. Si eliges una prenda de mayor precio, cancelas la diferencia. Si es de menor valor, puedes completar con otro artículo; en cambios comerciales no reembolsamos excedentes ni emitimos saldo a favor.</span></li>
                </ul></Section>
                <Section title="3. Gastos de transporte y envío"><p>Los costos de transporte derivados de cambios comerciales de talla o modelo son asumidos por el comprador y se informan previamente. Si el cambio corresponde a un error de despacho o defecto atribuible a la tienda, asumiremos los gastos necesarios de la solución que corresponda.</p></Section>
                <Section title="4. Solicitudes y excepciones legales"><p>Contáctanos con el código de pedido, la prenda y el motivo. Si existe un defecto o recibiste un artículo diferente, adjunta fotografías para ayudarnos a revisarlo.</p>{contact}<p>Esta política comercial y la condición de venta final no limitan los cambios o devoluciones exigidos por ley ni las soluciones por defectos o errores del pedido. Conforme al artículo 45 de la Ley Orgánica de Defensa del Consumidor de Ecuador, se mantiene el derecho de devolución o cambio dentro del término de quince (15) días posteriores a la recepción, cuando lo permitan la naturaleza de la prenda y su estado. Si legalmente corresponde un reembolso, coordinaremos el medio y plazo; no lo sustituiremos obligatoriamente por otra prenda o saldo de tienda.</p></Section>
              </>}
              {currentTab === "privacy" && <>
                <Section title="Responsable y contacto"><p>{contactSettings.legalBusinessName || brandName} administra los datos de las compras en {brandName}.</p>{legalAddress && <p>Domicilio de contacto: {legalAddress}.</p>}{contactSettings.phone && <p>Teléfono: {contactSettings.phone}.</p>}{contact}<p>Utiliza estos canales para consultas y solicitudes sobre tus datos.</p></Section>
                <Section title="Información y finalidades"><p>Recibimos directamente tus datos de cuenta y de pedidos: nombre, correo cuando corresponda, teléfono, prendas y datos de entrega. La identificación se solicita para el envío; al pagar por transferencia conservamos el comprobante para validar el pago. Evita incluir información ajena a tu compra en notas o imágenes.</p><p>Tratamos datos para gestionar compras, entregar productos, atender consultas y recuperar el acceso. Los servidores pueden registrar IP, errores y datos técnicos para seguridad. La compra se gestiona sobre una base contractual; otras finalidades deben contar con una base legal aplicable y se informarán previamente. Sin los datos obligatorios no podremos completar la compra; datos incorrectos pueden impedir la entrega.</p></Section>
                <Section title="Proveedores y comunicaciones"><p>Los servicios de alojamiento, base de datos e imágenes procesan información para operar la tienda. El personal autorizado recibe avisos de pedidos por Telegram y, si se habilita, el servicio de automatización configurado. El courier recibe los datos necesarios de entrega; la recuperación de contraseña puede utilizar un proveedor de correo. Estos proveedores pueden comunicar estados de pago o entrega.</p><p>Cuando está configurado, Umami mide visitas, navegación y eventos comerciales agregados. Enviamos las rutas sin parámetros ni fragmentos y excluimos nombres, correo, teléfono, dirección, comprobantes, texto de búsqueda y códigos de pedido. WhatsApp, Google Maps, Umami y los enlaces de pago tienen sus propias políticas. Las imágenes externas reciben datos técnicos al cargar. Algunos proveedores pueden procesar datos fuera de Ecuador y deben aplicarse las garantías exigibles. No vendemos tus datos personales.</p></Section>
                <Section title="Conservación y seguridad"><p>Los datos de cuenta se conservan durante su uso y hasta resolver una solicitud de eliminación, salvo obligaciones legales. Los pedidos y comprobantes se conservan durante su gestión, reclamos y periodos exigidos por obligaciones aplicables. Puedes solicitar el plazo de tu caso o la eliminación cuando proceda. Cerrar sesión o borrar el navegador no elimina registros del servidor; las copias en servicios externos tienen sus propios procesos de eliminación.</p><p>Las contraseñas se guardan mediante un resumen criptográfico con sal y las sesiones usan cookies protegidas. No pedimos datos de tarjeta dentro de la tienda. Los comprobantes pueden contener datos bancarios: adjunta solo lo necesario.</p></Section>
                <Section title="Tus derechos"><p>Puedes solicitar acceso, rectificación, actualización, eliminación, oposición, limitación y portabilidad cuando correspondan, y revocar un consentimiento sin afectar tratamientos anteriores lícitos. Escribe indicando tu solicitud; verificaremos tu identidad de forma proporcional. Puedes reclamar ante la <a href="https://spdp.gob.ec/" target="_blank" rel="noopener noreferrer">Superintendencia de Protección de Datos Personales</a>. No realizamos decisiones con efectos legales basadas únicamente en perfiles automatizados.</p>{contact}</Section>
              </>}
              {currentTab === "terms" && <>
                <Section title="1. Aceptación de los términos"><p>Al realizar un pedido en <strong>{brandName}</strong>, el usuario declara haber leído y aceptado los presentes términos y condiciones de compra. Puedes comprar con o sin cuenta; conserva el código de tu pedido para consultarlo en “Mis pedidos”. Estas condiciones no implican renunciar a los derechos reconocidos por la normativa ecuatoriana.</p></Section>
                <Section title="2. Precios y disponibilidad"><p>Todos los precios de la tienda están expresados en dólares estadounidenses (USD) y muestran las ofertas vigentes. Antes de confirmar verás el descuento, el envío y cualquier comisión aplicable. La disponibilidad está sujeta a las existencias de cada talla y color.</p></Section>
                <Section title="3. Procesamiento y despacho de pedidos"><p>Los pedidos se preparan y despachan una vez confirmado el pago. Las transferencias se validan mediante comprobante y los pagos con tarjeta se coordinan mediante un enlace externo. No ingreses ni envíes números de tarjeta, claves bancarias o códigos de seguridad por esta web o por chat.</p><p>Los tiempos de entrega son estimaciones coordinadas con empresas de courier nacionales. Si eliges retiro, acude al punto indicado cuando tu pedido esté listo. Te comunicaremos las incidencias relevantes.</p></Section>
                <Section title="4. Reserva de stock"><p>Al confirmar los datos de entrega, las prendas se reservan durante <strong>5 minutos</strong> antes de mostrar las opciones de pago. Recargar la página no reinicia ese plazo. Envía el pedido y, si pagas por transferencia, su comprobante antes de que termine el tiempo; al vencer, el stock vuelve a estar disponible y debes comprobarlo nuevamente antes de pagar.</p><p>Una vez registrado, el pedido queda pendiente de revisión: no equivale a un pago confirmado. Si la reserva vence y ya transferiste, no vuelvas a pagar; conserva el comprobante y contacta a la tienda para resolverlo.</p></Section>
                <Section title="5. Atención y mantenimiento"><p>Durante el mantenimiento se suspenden nuevos pedidos, pero puedes consultar los ya registrados y utilizar nuestros canales de atención. Para cambios o reclamos, indica tu código de pedido. Las actualizaciones de estas condiciones no modifican retroactivamente las condiciones acordadas de una compra.</p>{contact}</Section>
              </>}
              {currentTab === "cookies" && <>
                <Section title="Cookies necesarias"><p>Las cookies mantienen el acceso y protegen las solicitudes. Utilizamos cookies técnicas para cuentas, compras y pedidos; las sesiones están firmadas y no contienen tu contraseña.</p><dl className="legal-cookie-list"><dt>Sesión de cliente</dt><dd>Mantiene el acceso a tu cuenta. Duración configurada: 72 horas por defecto.</dd><dt>Pedidos sin cuenta</dt><dd>Permite consultarlos desde el mismo navegador durante 30 días desde su creación o renovación. Borrarla puede hacerte perder ese acceso y necesitar asistencia.</dd><dt>Seguridad de formularios</dt><dd>Protege solicitudes contra falsificaciones. Dura 12 horas y puede renovarse al usar la web.</dd><dt>Sesión de administrador</dt><dd>Solo para el panel. Dura 6 horas por defecto y puede renovarse durante su uso.</dd></dl></Section>
                <Section title="Almacenamiento del navegador"><p>Usamos almacenamiento local para carrito, favoritos, prendas vistas y confirmaciones pendientes de WhatsApp; estos datos permanecen hasta que los elimines o borres los datos del sitio. Guardamos temporalmente datos públicos durante la sesión para agilizar la carga y un identificador de reserva de stock, sin datos de pago, que vence a los 5 minutos. Los borradores administrativos se guardan al usar el panel.</p></Section>
                <Section title="Servicios externos y medición"><p>Cuando se configura el identificador de Umami, usamos este servicio para contar páginas vistas, rendimiento y eventos comerciales agregados. Umami no utiliza cookies de analítica en esta integración; excluimos parámetros de búsqueda y fragmentos de las URL, respetamos la preferencia “Do Not Track” del navegador y no identificamos sesiones con datos de clientes. Si el identificador no está configurado, el tracker no se carga.</p><p>El mapa de la página principal se carga automáticamente al acercarte a su sección, sin pulsar un botón. En el carrito y los pedidos, el mapa integrado se carga solo cuando eliges verlo. Google puede utilizar cookies y tratar datos técnicos conforme a su <a href="https://policies.google.com/privacy?hl=es" target="_blank" rel="noopener noreferrer">política de privacidad</a>. Al abrir WhatsApp, Umami o un enlace de pago también intervienen sus proveedores.</p></Section>
                <Section title="Cómo gestionarlas"><p>Consulta, bloquea o elimina cookies y almacenamiento en los ajustes de privacidad del navegador. Bloquear cookies necesarias puede impedir iniciar sesión, comprar o consultar pedidos sin cuenta. Borrar datos locales no elimina la cuenta ni los pedidos del servidor; solicita esa eliminación mediante nuestros canales.</p>{contact}</Section>
              </>}
            </div>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}
export default LegalModal;
