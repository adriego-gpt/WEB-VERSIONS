import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { ANIMATION } from "../../constants/animation";

export function CustomDropdown({
  options = [],
  value,
  onChange,
  icon: Icon,
  placeholder = "Seleccionar",
  className = "",
  ariaLabel,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);

  const selectedIndex = options.findIndex((opt) => opt.value === value);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus?.();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          onChange(options[highlightedIndex].value);
          setIsOpen(false);
          triggerRef.current?.focus?.();
        }
      } else if (event.key === "Home") {
        event.preventDefault();
        setHighlightedIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setHighlightedIndex(options.length - 1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, highlightedIndex, onChange, options]);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  return (
    <div className={`custom-dropdown-container ${className}`} ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`custom-dropdown-trigger ${isOpen ? "open" : ""}`}
        onClick={() => {
          setIsOpen((prev) => {
            const next = !prev;
            if (next) setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
            return next;
          });
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || placeholder}
      >
        <div className="custom-dropdown-trigger-content">
          {Icon && <Icon size={15} className="custom-dropdown-icon" />}
          <span className="custom-dropdown-label">{displayLabel}</span>
        </div>
        <ChevronDown size={14} className={`custom-dropdown-chevron ${isOpen ? "rotated" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <Motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.16, ease: ANIMATION.easeOut }}
            style={{ transformOrigin: "top center" }}
            className="custom-dropdown-menu"
            role="listbox"
          >
            {options.map((option, idx) => {
              const isSelected = option.value === value;
              const isHighlighted = idx === highlightedIndex;
              return (
                <button
                  type="button"
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  className={`custom-dropdown-item ${isSelected ? "selected" : ""} ${isHighlighted ? "highlighted" : ""}`}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    triggerRef.current?.focus?.();
                  }}
                >
                  <span className="custom-dropdown-item-label">{option.label}</span>
                  {isSelected && <Check size={14} className="custom-dropdown-check" />}
                </button>
              );
            })}
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CustomDropdown;
