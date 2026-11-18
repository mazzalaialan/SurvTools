import { useId } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Cómo calibrar la brújula del celular: dibujar un 8 acostado en el aire, girando la muñeca (dibujo esquemático, con los colores del tema,
 * igual que el del inclinómetro). Las flechas muestran el sentido; el celular se dibuja en dos puntos del recorrido, inclinado como va
 * quedando al girar la muñeca.
 */
export function CalibrationDrawing() {
  const { t } = useTranslation();
  const marker = useId();
  return (
    <svg className="calib-drawing" viewBox="0 0 220 120" role="img" aria-label={t('compass.calibDrawing')} data-testid="calibration-drawing">
      <defs>
        <marker id={marker} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" className="draw-arrow-head" />
        </marker>
      </defs>
      {/* El 8 acostado (∞) que hay que dibujar con el celular. */}
      <path
        d="M 110 60 C 140 18 192 18 192 60 C 192 102 140 102 110 60 C 80 18 28 18 28 60 C 28 102 80 102 110 60 Z"
        fill="none"
        className="draw-sight"
      />
      {/* Sentido del recorrido: arriba a la derecha va hacia la derecha, abajo vuelve; del otro lado, al revés. */}
      <path d="M 150 28 L 164 29" className="draw-arrow" markerEnd={`url(#${marker})`} />
      <path d="M 164 91 L 150 92" className="draw-arrow" markerEnd={`url(#${marker})`} />
      <path d="M 70 28 L 56 29" className="draw-arrow" markerEnd={`url(#${marker})`} />
      <path d="M 56 91 L 70 92" className="draw-arrow" markerEnd={`url(#${marker})`} />
      {/* El celular en dos puntos del recorrido, inclinado al girar la muñeca. */}
      <g transform="translate(176 34) rotate(35)">
        <rect x="-8" y="-15" width="16" height="30" rx="3" className="draw-phone" />
        <rect x="-6" y="-12" width="12" height="24" rx="1.5" className="draw-screen-front" />
      </g>
      <g transform="translate(44 86) rotate(-35)">
        <rect x="-8" y="-15" width="16" height="30" rx="3" className="draw-phone" />
        <rect x="-6" y="-12" width="12" height="24" rx="1.5" className="draw-screen-front" />
      </g>
    </svg>
  );
}
