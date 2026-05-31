// Icon custom para "Foco". Target concéntrico con un flecha clavada cuya
// PUNTA está embebida en el bullseye y el shaft sale por arriba-derecha.
// La punta es un triángulo lleno para que se lea claro a 13–16px.

type Props = {
  size?: number;
  className?: string;
  strokeWidth?: number;
  "aria-label"?: string;
};

export function FocoIcon({
  size = 16,
  className,
  strokeWidth = 2,
  "aria-label": ariaLabel,
}: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
    >
      {/* Anillo exterior, cortado en el cuadrante superior derecho. */}
      <path d="M21 12a9 9 0 1 1-9-9" />
      {/* Anillo interior, mismo corte. */}
      <path d="M17 12a5 5 0 1 1-5-5" />
      {/* Shaft: línea recta desde el exterior hasta el tip (centro). */}
      <line x1="22" y1="2" x2="12" y2="12" />
      {/* Arrowhead lleno: triángulo con punta en el centro (12,12).
          Los dos vértices traseros están back-along-shaft y perpendicular
          al shaft (direcciones NE para volver hacia el outer). Filled
          rinde mejor que stroke V a 13–16px. */}
      <polygon
        points="12,12 16.5,10.5 13.5,7.5"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
