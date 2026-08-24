import React, { Component } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
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

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            minHeight: "40vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 24px",
            textAlign: "center",
            color: "#ffffff",
            background: "#000000",
          }}
          role="alert"
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
              color: "#ef4444",
            }}
          >
            <AlertCircle size={28} />
          </div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 8px" }}>
            {this.props.title || "Inconveniente al cargar esta vista"}
          </h2>
          <p
            style={{
              fontSize: "0.9rem",
              color: "#a1a1aa",
              maxWidth: 420,
              margin: "0 0 24px",
              lineHeight: 1.5,
            }}
          >
            {this.props.message || "Ocurrió una pausa temporal al conectar con la tienda. Puedes recargar para continuar sin perder tu progreso."}
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            {this.props.onReset && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={this.handleReset}
                style={{ padding: "10px 20px" }}
              >
                Volver
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={this.handleReload}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 24px",
              }}
            >
              <RefreshCw size={16} />
              <span>Recargar tienda</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
