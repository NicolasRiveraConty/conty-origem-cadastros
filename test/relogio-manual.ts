import type { Relogio } from "../src/relogio.js";

export interface RelogioManual extends Relogio {
  avancarMs(ms: number): void;
  definir(data: Date): void;
}

export function relogioManual(inicio: Date): RelogioManual {
  let instante = inicio.getTime();
  return {
    agora() {
      return new Date(instante);
    },
    avancarMs(ms: number) {
      instante += ms;
    },
    definir(data: Date) {
      instante = data.getTime();
    },
  };
}
