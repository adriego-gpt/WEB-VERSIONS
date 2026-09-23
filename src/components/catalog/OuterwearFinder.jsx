import { createElement, useState } from "react";
import { ArrowRight, RotateCcw, Snowflake, Wind } from "lucide-react";

const OUTERWEAR_OPTION_ICONS = Object.freeze({
  peluche: Snowflake,
  reversible: RotateCcw,
  ligera: Wind,
});

const FALLBACK_OPTIONS = Object.freeze([
  {
    id: "peluche",
    label: "Acolchado con peluche",
    description: "Calidez suave para días fríos",
    query: "peluche",
    Icon: Snowflake,
  },
  {
    id: "reversible",
    label: "Gabardina reversible",
    description: "Dos estilos en una sola prenda",
    query: "reversible gabardina",
    Icon: RotateCcw,
  },
  {
    id: "ligera",
    label: "Chompa ligera",
    description: "Versátil para todos los días",
    query: "chompa",
    Icon: Wind,
  },
]);

export function OuterwearFinder({ settings = {}, onApplySelection, onBrowseAll }) {
  const configuredOptions = Array.isArray(settings.options) ? settings.options : [];
  const options = FALLBACK_OPTIONS.map((fallback, index) => ({
    ...fallback,
    ...(configuredOptions.find((option) => option?.id === fallback.id) || configuredOptions[index] || {}),
    id: fallback.id,
    Icon: OUTERWEAR_OPTION_ICONS[fallback.id],
  }));
  const [selectedId, setSelectedId] = useState(options[0].id);
  const selectedOption = options.find((option) => option.id === selectedId) || options[0];

  const handleOptionKeyDown = (event, currentIndex) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const lastIndex = options.length - 1;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? lastIndex
        : (currentIndex + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + options.length) % options.length;
    const nextOption = options[nextIndex];
    setSelectedId(nextOption.id);
    event.currentTarget.parentElement?.querySelector(`[data-finder-option="${nextOption.id}"]`)?.focus();
  };

  return (
    <section className="outerwear-finder section-shell" aria-labelledby="outerwear-finder-heading">
      <div className="outerwear-finder-layout">
        <div className="outerwear-finder-media">
          <img
            src={settings.image || "/editorial/outerwear-finder.png"}
            alt={settings.imageAlt || "Tres modelos luciendo una gabardina, un acolchado con peluche y una chompa ligera"}
            loading="lazy"
            decoding="async"
            sizes="(min-width: 900px) 42vw, 100vw"
          />
        </div>

        <div className="outerwear-finder-content">
          <div className="outerwear-finder-copy">
            <h2 id="outerwear-finder-heading">{settings.title || "Encuentra tu abrigo ideal"}</h2>
            <p>{settings.description || "Elige el estilo que buscas y te mostraremos las prendas disponibles."}</p>
          </div>

          <div className="outerwear-finder-options" role="radiogroup" aria-label="Tipo de abrigo">
            {options.map(({ id, label, description, Icon }, index) => {
              const isSelected = id === selectedId;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  data-finder-option={id}
                  className={`outerwear-finder-option ${isSelected ? "is-selected" : ""}`}
                  onClick={() => setSelectedId(id)}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                >
                  <span className="outerwear-finder-option-icon" aria-hidden="true">
                    {createElement(Icon, { size: 24, strokeWidth: 1.7 })}
                  </span>
                  <span className="outerwear-finder-option-copy">
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <span className="outerwear-finder-radio" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <div className="outerwear-finder-actions">
            <button
              type="button"
              className="outerwear-finder-submit"
              onClick={() => onApplySelection(selectedOption)}
            >
              {settings.primaryCta || "Ver mi selección"}
              <ArrowRight size={19} aria-hidden="true" />
            </button>
            <button type="button" className="outerwear-finder-browse" onClick={onBrowseAll}>
              {settings.secondaryCta || "Ver catálogo completo"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
