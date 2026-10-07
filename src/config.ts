import { JANELA_PADRAO_DIAS } from "./tipos.js";
import { exigirJanelaDias } from "./validacao.js";

export function lerJanelaDias(env: NodeJS.ProcessEnv = process.env): number {
  const bruto = env.JANELA_ATRIBUICAO_DIAS;
  if (bruto === undefined || bruto.trim() === "") return JANELA_PADRAO_DIAS;
  if (!/^\d+$/.test(bruto.trim())) {
    throw new Error(mensagemJanela(bruto));
  }
  try {
    return exigirJanelaDias(Number(bruto.trim()));
  } catch {
    throw new Error(mensagemJanela(bruto));
  }
}

function mensagemJanela(bruto: string): string {
  return `JANELA_ATRIBUICAO_DIAS inválido: "${bruto}". Use um inteiro de 1 a 365.`;
}

export function lerPorta(bruto: string | undefined): number {
  if (bruto === undefined || bruto.trim() === "") return 3000;
  if (!/^\d+$/.test(bruto.trim())) {
    throw new Error(`PORT inválido: "${bruto}".`);
  }
  const porta = Number(bruto.trim());
  if (porta < 1 || porta > 65535) {
    throw new Error(`PORT inválido: "${bruto}".`);
  }
  return porta;
}
