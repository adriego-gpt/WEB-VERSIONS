import React, { Component } from "react";
import { RefreshCw, Home, MessageCircle, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";

function AtelierFashionIllustration() {
  return (
    <div className="atelier-illustration-frame" aria-hidden="true">
      <div className="atelier-illustration-canvas">
        <svg
          viewBox="0 0 200 260"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="atelier-silhouette-svg"
        >
          {/* Soft ambient golden vignette */}
          <ellipse cx="100" cy="130" rx="85" ry="115" fill="rgba(212, 175, 55, 0.06)" />
          
          {/* Wide-brim Haute Couture Hat */}
          <ellipse cx="100" cy="50" rx="46" ry="10" fill="#18181b" transform="rotate(-5 100 50)" />
          <path
            d="M82 48C82 34 88 28 100 28C112 28 118 34 118 48Z"
            fill="#18181b"
          />
          <path
            d="M84 45C92 43 108 43 116 45"
            stroke="#d4af37"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Graceful Neck and Silhouette Line */}
          <path
            d="M96 56C96 64 97 70 97 74C99 75 101 75 103 74C103 70 104 64 104 56"
            stroke="#27272a"
            strokeWidth="1.8"
            strokeLinecap="round"
          />

          {/* Draped Haute Couture Trench Gown */}
          <path
            d="M80 80C88 72 112 72 120 80L135 116C138 123 133 132 124 132H112L128 190C130 198 124 206 116 206H84C76 206 70 198 72 190L88 132H76C67 132 62 123 65 116L80 80Z"
            fill="#27272a"
            opacity="0.94"
          />

          {/* Flowing Silk Sash & Gold Accent Belt */}
          <path
            d="M84 128C94 133 106 133 116 128L120 137C108 142 92 142 80 137Z"
            fill="#d4af37"
          />
          <path
            d="M106 137C108 155 116 178 126 200L116 204C107 180 98 156 100 137Z"
            fill="rgba(212, 175, 55, 0.8)"
          />

          {/* Dynamic Slit Line */}
          <path
            d="M92 140L84 195"
            stroke="#18181b"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Stiletto Heels & Leg Stride */}
          <path
            d="M89 206L86 232L81 234M86 232H91L89 242"
            stroke="#18181b"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M111 206L116 228L122 230M116 228H111L113 238"
            stroke="#18181b"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Editorial Sketch Details */}
          <path
            d="M58 104C54 118 58 142 63 158"
            stroke="#d4af37"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.6"
          />
          <path
            d="M142 104C146 118 142 142 137 158"
            stroke="#d4af37"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.6"
          />
        </svg>
      </div>
      <blockquote className="atelier-illustration-quote">
        <p>“La elegancia es la única belleza que nunca desaparece.”</p>
        <cite>— Audrey Hepburn</cite>
      </blockquote>
    </div>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  handleGoHome = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
    this.props.onReset?.();
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <main className="atelier-error-wrapper" role="alert" aria-live="assertive">
          <div className="atelier-error-card">
            {/* ⚜️ Haute Couture Brand Header */}
            <header className="atelier-error-brand">
              <span className="atelier-error-brand-text">ADRIEGO STORE</span>
            </header>

            {/* 🎨 Framed Fashion Silhouette & Quote */}
            <AtelierFashionIllustration />

            {/* ✒️ Editorial Heading & Reassurance */}
            <div className="atelier-error-content">
              <h1 className="atelier-error-title">
                {this.props.title || "Un Momento, por favor"}
              </h1>
              <p className="atelier-error-description">
                {this.props.message || "Estamos restaurando la conexión con la colección. Tu selección de prendas y favoritos están protegidos en tu dispositivo."}
              </p>

              <div className="atelier-error-safety-badge">
                <ShieldCheck size={14} className="atelier-safety-icon" />
                <span>Carrito y preferencias seguros</span>
              </div>
            </div>

            {/* 🔘 Side-by-Side Pill CTA Group */}
            <div className="atelier-error-actions">
              <button
                type="button"
                className="atelier-btn-primary"
                onClick={this.handleReload}
                aria-label="Reanudar navegación y recargar la página"
              >
                <RefreshCw size={15} />
                <span>Reanudar Navegación</span>
              </button>

              {this.props.onReset ? (
                <button
                  type="button"
                  className="atelier-btn-secondary"
                  onClick={this.handleReset}
                  aria-label="Volver a la vista anterior"
                >
                  <Home size={15} />
                  <span>Volver</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="atelier-btn-secondary"
                  onClick={this.handleGoHome}
                  aria-label="Volver a la portada de la tienda"
                >
                  <Home size={15} />
                  <span>Volver al Inicio</span>
                </button>
              )}
            </div>

            {/* 💬 WhatsApp Concierge Fallback */}
            <div className="atelier-error-footer">
              <a
                href="https://wa.me/?text=Hola%20Adriego%20Store%2C%20necesito%20asistencia%20con%20mi%20compra"
                target="_blank"
                rel="noopener noreferrer"
                className="atelier-error-contact-link"
              >
                <MessageCircle size={13} />
                <span>Asistencia personalizada por WhatsApp</span>
              </a>

              {/* 🛠️ Discreet Technical Details Accordion */}
              {this.state.error && (
                <div className="atelier-error-debug-section">
                  <button
                    type="button"
                    className="atelier-error-debug-toggle"
                    onClick={this.toggleDetails}
                    aria-expanded={this.state.showDetails}
                  >
                    <span>Detalles técnicos</span>
                    {this.state.showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {this.state.showDetails && (
                    <pre className="atelier-error-debug-pre">
                      {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
