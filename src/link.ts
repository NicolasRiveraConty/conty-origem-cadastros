import type { ParametrosDoLink } from "./tipos.js";
import { ErroDeAtribuicao, exigirId, exigirTipo } from "./validacao.js";

export const URL_BASE_DO_LINK = "https://app.conty.com/r";

export const EXEMPLO_CAMPANHA = {
  tipo: "campanha",
  origemId: "black-friday-2026",
  clickId: "clk_bf_8f3a",
} as const satisfies ParametrosDoLink;

export const EXEMPLO_INDICACAO = {
  tipo: "indicacao",
  origemId: "convite_maria_042",
  clickId: "clk_ind_91c2",
} as const satisfies ParametrosDoLink;

export function montarLink(base: string, parametros: ParametrosDoLink): string {
  const url = lerUrl(base);
  url.searchParams.set("tipo", exigirTipo(parametros.tipo));
  url.searchParams.set("id", exigirId("id", parametros.origemId));
  url.searchParams.set("click_id", exigirId("click_id", parametros.clickId));
  return url.toString();
}

export function parametrosDoLink(entrada: string): ParametrosDoLink {
  const url = lerUrl(entrada);
  return {
    tipo: exigirTipo(url.searchParams.get("tipo")),
    origemId: exigirId("id", url.searchParams.get("id")),
    clickId: exigirId("click_id", url.searchParams.get("click_id")),
  };
}

function lerUrl(entrada: string): URL {
  try {
    return new URL(entrada);
  } catch {
    throw new ErroDeAtribuicao("payload_invalido", "Link inválido.", 400);
  }
}
