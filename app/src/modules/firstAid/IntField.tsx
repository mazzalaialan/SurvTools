import { useEffect, useState } from 'react';

/**
 * Campo de número entero (personas, días): se puede borrar y tipear sin que vuelva a «1» y se pegue lo escrito (con `type="number"` y un
 * valor mínimo, borrar dejaba «1» y escribir 7 daba «17»). Solo acepta dígitos; el valor válido (entre `min` y `max`) se aplica al tipear
 * y, al salir, un campo vacío vuelve al valor vigente.
 */
export function IntField({ id, value, min, max, onChange, testId }: { id: string; value: number; min: number; max: number; onChange: (n: number) => void; testId?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      id={id}
      className="input"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={text}
      data-testid={testId}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, '');
        setText(raw);
        const n = Number(raw);
        if (raw !== '' && n >= min) onChange(Math.min(max, n));
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
