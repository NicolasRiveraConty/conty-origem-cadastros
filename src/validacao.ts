import {
  JANELA_MAX_DIAS,
  JANELA_MIN_DIAS,
  type TipoToque,
} from "./tipos.js";

export type CodigoErro =
  | "payload_invalido"
  | "clique_desconhecido"
  | "cadastro_desconhecido"
  | "click_id_conflito"
  | "abertura_conflito"
  | "cadastro_conflito"
  | "rota_desconhecida"
  | "erro_interno";

export class ErroDeAtribuicao extends Error {
  readonly codigo: CodigoErro;
  readonly statusHttp: number;

  constructor(codigo: CodigoErro, mensagem: string, statusHttp: number) {
    super(mensagem);
    this.name = "ErroDeAtribuicao";
    this.codigo = codigo;
    this.statusHttp = statusHttp;
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function exigirId(campo: string, valor: unknown): string {
  if (typeof valor !== "string" || !ID.test(valor)) {
    throw new ErroDeAtribuicao(
      "payload_invalido",
      `${campo} deve ter de 1 a 128 caracteres (letras, números e . _ : -).`,
      400,
    );
  }
  return valor;
}

export function exigirTipo(valor: unknown): TipoToque {
  if (valor !== "campanha" && valor !== "indicacao") {
    throw new ErroDeAtribuicao(
      "payload_invalido",
      'tipo deve ser "campanha" ou "indicacao". Orgânico não viaja no link: é a origem quando não há toque válido.',
      400,
    );
  }
  return valor;
}

export function exigirJanelaDias(valor: number): number {
  if (!Number.isInteger(valor) || valor < JANELA_MIN_DIAS || valor > JANELA_MAX_DIAS) {
    throw new ErroDeAtribuicao(
      "payload_invalido",
      `A janela deve ser um inteiro de ${JANELA_MIN_DIAS} a ${JANELA_MAX_DIAS} dias.`,
      400,
    );
  }
  return valor;
}

export function exigirData(valor: Date, campo: string): Date {
  if (!(valor instanceof Date) || Number.isNaN(valor.getTime())) {
    throw new ErroDeAtribuicao("payload_invalido", `${campo} inválido.`, 400);
  }
  return new Date(valor.getTime());
}
