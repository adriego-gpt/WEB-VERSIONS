import React from "react";
import { UserRound, KeyRound, MapPin, Package, X } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";

export function ProfileQuickMenu({
  open,
  position,
  onClose,
  onOpenSection,
  onOpenOrders,
  onLogout,
}) {
  if (!open) return null;

  return (
    <AnimatePresence>
      <Motion.div
        className="profile-quick-menu-layer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
        onClick={onClose}
      >
        <Motion.div
          className="profile-quick-menu"
          style={{ top: `${position.top}px`, left: `${position.left}px` }}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: 0.18 }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="profile-quick-item" onClick={() => onOpenSection("datos")}>
            <UserRound size={15} />
            <span>Datos personales</span>
          </button>
          <button type="button" className="profile-quick-item" onClick={() => onOpenSection("password")}>
            <KeyRound size={15} />
            <span>Cambiar contraseña</span>
          </button>
          <button type="button" className="profile-quick-item" onClick={() => onOpenSection("direccion")}>
            <MapPin size={15} />
            <span>Libreta de direcciones</span>
          </button>
          <button type="button" className="profile-quick-item" onClick={onOpenOrders}>
            <Package size={15} />
            <span>Mis pedidos</span>
          </button>
          <button type="button" className="profile-quick-item profile-quick-item-danger" onClick={onLogout}>
            <X size={15} />
            <span>Cerrar sesión</span>
          </button>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
}

export default ProfileQuickMenu;
