export const REGRA_ULTIMO_TOQUE = "ultimo_toque_valido" as const;

export const JANELA_PADRAO_DIAS = 7;
export const JANELA_MIN_DIAS = 1;
export const JANELA_MAX_DIAS = 365;

/** Dia civil em milissegundos. A janela não usa calendário, para não oscilar com fuso ou horário de verão. */
export const MS_POR_DIA = 86_400_000;

export const TIPOS_DE_TOQUE = ["campanha", "indicacao"] as const;

export type TipoToque = (typeof TIPOS_DE_TOQUE)[number];
export type TipoOrigem = TipoToque | "organico";

export type MotivoDecisao = "ultimo_toque_valido" | "sem_toque_valido";

export type MotivoToque =
  | "escolhido"
  | "anterior_na_janela"
  | "empate_de_horario"
  | "fora_da_janela"
  | "posterior_ao_cadastro";

export interface OrigemAtribuida {
  tipo: TipoOrigem;
  origemId: string | null;
  clickId: string | null;
}

export interface Clique {
  clickId: string;
  tipo: TipoToque;
  origemId: string;
  clicadoEm: Date;
}

export interface Abertura {
  clickId: string;
  deviceId: string;
  abertoEm: Date;
  ordem: number;
}

/** Toque já unido: o clique do link mais a primeira abertura no device. */
export interface Toque {
  clickId: string;
  tipo: TipoToque;
  origemId: string;
  clicadoEm: Date;
  abertoEm: Date;
  ordem: number;
}

export interface ToqueConsiderado {
  clickId: string;
  tipo: TipoToque;
  origemId: string;
  clicadoEm: Date;
  abertoEm: Date;
  ordem: number;
  dentroDaJanela: boolean;
  escolhido: boolean;
  motivoCodigo: MotivoToque;
  motivo: string;
}

export interface ResultadoDaRegra {
  regra: typeof REGRA_ULTIMO_TOQUE;
  janelaDias: number;
  janelaInicio: Date;
  janelaFim: Date;
  origem: OrigemAtribuida;
  motivoCodigo: MotivoDecisao;
  motivo: string;
  toquesConsiderados: ToqueConsiderado[];
}

export interface DecisaoCadastro extends ResultadoDaRegra {
  cadastroId: string;
  deviceId: string;
  cadastradoEm: Date;
}

export interface ParametrosDoLink {
  tipo: TipoToque;
  origemId: string;
  clickId: string;
}

export interface Gravacao<T> {
  registro: T;
  criado: boolean;
}
