import {
  MS_POR_DIA,
  REGRA_ULTIMO_TOQUE,
  type MotivoToque,
  type OrigemAtribuida,
  type ResultadoDaRegra,
  type Toque,
  type ToqueConsiderado,
} from "./tipos.js";
import { exigirData, exigirJanelaDias } from "./validacao.js";

/**
 * Regra de vitória: último toque válido dentro da janela.
 *
 * A janela é [cadastradoEm - janelaDias, cadastradoEm], fechada nos dois lados,
 * medida em milissegundos (janelaDias * 86_400_000) sobre abertoEm — o instante
 * da primeira abertura gravada no device.
 * Entre os toques válidos vence o abertoEm mais recente. Empate de horário:
 * maior ordem de gravação. click_id repetido entra uma vez, pela menor ordem.
 * Sem toque válido, a origem é "organico".
 */
export function resolverAtribuicao(entrada: {
  toques: readonly Toque[];
  cadastradoEm: Date;
  janelaDias: number;
}): ResultadoDaRegra {
  const janelaDias = exigirJanelaDias(entrada.janelaDias);
  const fim = exigirData(entrada.cadastradoEm, "cadastrado_em");
  const inicio = inicioDaJanela(fim, janelaDias);
  const unicos = deduplicarPorClique(entrada.toques);
  const ordenados = [...unicos].sort(compararRecencia);

  const validos = ordenados.filter(
    (toque) => classeDoToque(toque, inicio, fim) === "dentro",
  );
  const vencedor = validos.reduce<Toque | undefined>(
    (melhor, atual) =>
      melhor === undefined || compararRecencia(atual, melhor) > 0 ? atual : melhor,
    undefined,
  );
  const empatouHorario =
    vencedor !== undefined &&
    validos.some(
      (toque) =>
        toque.clickId !== vencedor.clickId &&
        toque.abertoEm.getTime() === vencedor.abertoEm.getTime(),
    );

  const toquesConsiderados = ordenados.map((toque) =>
    descreverToque(toque, inicio, fim, janelaDias, vencedor, empatouHorario),
  );

  if (vencedor === undefined) {
    return {
      regra: REGRA_ULTIMO_TOQUE,
      janelaDias,
      janelaInicio: inicio,
      janelaFim: fim,
      origem: origemOrganica(),
      motivoCodigo: "sem_toque_valido",
      motivo: `Nenhum toque válido dentro da janela de ${janelaDias} dias. Cadastro marcado como orgânico.`,
      toquesConsiderados,
    };
  }

  return {
    regra: REGRA_ULTIMO_TOQUE,
    janelaDias,
    janelaInicio: inicio,
    janelaFim: fim,
    origem: {
      tipo: vencedor.tipo,
      origemId: vencedor.origemId,
      clickId: vencedor.clickId,
    },
    motivoCodigo: "ultimo_toque_valido",
    motivo: textoVencedor(janelaDias, vencedor, empatouHorario),
    toquesConsiderados,
  };
}

export function inicioDaJanela(fim: Date, janelaDias: number): Date {
  return new Date(fim.getTime() - janelaDias * MS_POR_DIA);
}

function deduplicarPorClique(toques: readonly Toque[]): Toque[] {
  const porClique = new Map<string, Toque>();
  for (const toque of toques) {
    exigirData(toque.clicadoEm, "clicado_em");
    exigirData(toque.abertoEm, "aberto_em");
    const anterior = porClique.get(toque.clickId);
    if (anterior === undefined || toque.ordem < anterior.ordem) {
      porClique.set(toque.clickId, toque);
    }
  }
  return [...porClique.values()];
}

/** Positivo quando `a` é mais recente que `b`. */
function compararRecencia(a: Toque, b: Toque): number {
  const tempo = a.abertoEm.getTime() - b.abertoEm.getTime();
  if (tempo !== 0) return tempo;
  const ordem = a.ordem - b.ordem;
  if (ordem !== 0) return ordem;
  if (a.clickId === b.clickId) return 0;
  return a.clickId > b.clickId ? 1 : -1;
}

type ClasseToque = "dentro" | "fora" | "posterior";

function classeDoToque(toque: Toque, inicio: Date, fim: Date): ClasseToque {
  const instante = toque.abertoEm.getTime();
  if (instante > fim.getTime()) return "posterior";
  if (instante < inicio.getTime()) return "fora";
  return "dentro";
}

function descreverToque(
  toque: Toque,
  inicio: Date,
  fim: Date,
  janelaDias: number,
  vencedor: Toque | undefined,
  empatouHorario: boolean,
): ToqueConsiderado {
  const classe = classeDoToque(toque, inicio, fim);
  const escolhido = vencedor !== undefined && toque.clickId === vencedor.clickId;
  const motivoCodigo = codigoDoToque(toque, classe, escolhido, vencedor);
  return {
    clickId: toque.clickId,
    tipo: toque.tipo,
    origemId: toque.origemId,
    clicadoEm: new Date(toque.clicadoEm.getTime()),
    abertoEm: new Date(toque.abertoEm.getTime()),
    ordem: toque.ordem,
    dentroDaJanela: classe === "dentro",
    escolhido,
    motivoCodigo,
    motivo: textoDoToque(motivoCodigo, janelaDias, empatouHorario && escolhido),
  };
}

function codigoDoToque(
  toque: Toque,
  classe: ClasseToque,
  escolhido: boolean,
  vencedor: Toque | undefined,
): MotivoToque {
  if (escolhido) return "escolhido";
  if (classe === "posterior") return "posterior_ao_cadastro";
  if (classe === "fora") return "fora_da_janela";
  if (
    vencedor !== undefined &&
    toque.abertoEm.getTime() === vencedor.abertoEm.getTime()
  ) {
    return "empate_de_horario";
  }
  return "anterior_na_janela";
}

function textoDoToque(codigo: MotivoToque, janelaDias: number, empate: boolean): string {
  switch (codigo) {
    case "escolhido": {
      const base = `Último toque válido dentro da janela de ${janelaDias} dias.`;
      return empate
        ? `${base} Empate de horário desfeito pela ordem de gravação.`
        : base;
    }
    case "anterior_na_janela":
      return "Dentro da janela, anterior ao último toque válido.";
    case "empate_de_horario":
      return "Mesmo horário do toque escolhido. A maior ordem de gravação venceu.";
    case "fora_da_janela":
      return `Fora da janela de ${janelaDias} dias.`;
    case "posterior_ao_cadastro":
      return "Posterior ao momento do cadastro.";
  }
}

function textoVencedor(janelaDias: number, vencedor: Toque, empatouHorario: boolean): string {
  const base = `Último toque válido dentro da janela de ${janelaDias} dias: ${vencedor.tipo} ${vencedor.origemId} (click_id ${vencedor.clickId}).`;
  return empatouHorario
    ? `${base} Empate de horário desfeito pela ordem de gravação.`
    : base;
}

function origemOrganica(): OrigemAtribuida {
  return { tipo: "organico", origemId: null, clickId: null };
}
