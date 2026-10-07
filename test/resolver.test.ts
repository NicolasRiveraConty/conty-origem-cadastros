import { describe, expect, it } from "vitest";
import { inicioDaJanela, resolverAtribuicao } from "../src/resolver.js";
import { MS_POR_DIA, type Toque } from "../src/tipos.js";

const CADASTRO = new Date("2026-03-15T12:00:00.000Z");

function toque(parcial: Partial<Toque> & Pick<Toque, "clickId" | "abertoEm">): Toque {
  return {
    tipo: "campanha",
    origemId: "campanha-x",
    clicadoEm: parcial.clicadoEm ?? parcial.abertoEm,
    ordem: parcial.ordem ?? 1,
    ...parcial,
  };
}

describe("resolverAtribuicao", () => {
  it("marca cadastro sem toque como organico, com a janela explícita", () => {
    const resultado = resolverAtribuicao({
      toques: [],
      cadastradoEm: CADASTRO,
      janelaDias: 7,
    });

    expect(resultado.origem).toEqual({
      tipo: "organico",
      origemId: null,
      clickId: null,
    });
    expect(resultado.motivoCodigo).toBe("sem_toque_valido");
    expect(resultado.motivo).toContain("orgânico");
    expect(resultado.regra).toBe("ultimo_toque_valido");
    expect(resultado.janelaDias).toBe(7);
    expect(resultado.janelaFim.toISOString()).toBe(CADASTRO.toISOString());
    expect(resultado.janelaInicio.toISOString()).toBe(
      inicioDaJanela(CADASTRO, 7).toISOString(),
    );
    expect(resultado.toquesConsiderados).toEqual([]);
  });

  it("escolhe o único toque válido", () => {
    const abertoEm = new Date(CADASTRO.getTime() - 2 * MS_POR_DIA);
    const resultado = resolverAtribuicao({
      toques: [toque({ clickId: "clk_1", abertoEm, tipo: "indicacao", origemId: "convite_ana" })],
      cadastradoEm: CADASTRO,
      janelaDias: 7,
    });

    expect(resultado.origem).toEqual({
      tipo: "indicacao",
      origemId: "convite_ana",
      clickId: "clk_1",
    });
    expect(resultado.motivoCodigo).toBe("ultimo_toque_valido");
    expect(resultado.toquesConsiderados).toHaveLength(1);
    expect(resultado.toquesConsiderados[0]).toMatchObject({
      clickId: "clk_1",
      escolhido: true,
      dentroDaJanela: true,
      motivoCodigo: "escolhido",
    });
  });

  it("entre dois links diferentes, vence o último toque válido e o outro fica na auditoria", () => {
    const indicacao = toque({
      clickId: "clk_ind",
      tipo: "indicacao",
      origemId: "convite_maria_042",
      abertoEm: new Date(CADASTRO.getTime() - 5 * MS_POR_DIA),
      ordem: 1,
    });
    const campanha = toque({
      clickId: "clk_bf",
      tipo: "campanha",
      origemId: "black-friday-2026",
      abertoEm: new Date(CADASTRO.getTime() - 1 * MS_POR_DIA),
      ordem: 2,
    });

    const resultado = resolverAtribuicao({
      toques: [campanha, indicacao],
      cadastradoEm: CADASTRO,
      janelaDias: 7,
    });

    expect(resultado.origem).toEqual({
      tipo: "campanha",
      origemId: "black-friday-2026",
      clickId: "clk_bf",
    });
    expect(resultado.toquesConsiderados.map((item) => item.clickId)).toEqual([
      "clk_ind",
      "clk_bf",
    ]);
    expect(resultado.toquesConsiderados[0]).toMatchObject({
      motivoCodigo: "anterior_na_janela",
      escolhido: false,
      dentroDaJanela: true,
    });
    expect(resultado.toquesConsiderados[1]).toMatchObject({
      motivoCodigo: "escolhido",
      escolhido: true,
    });
  });

  it("ignora o toque mais novo quando ele cai fora da janela e fica com o anterior válido", () => {
    const valido = toque({
      clickId: "clk_velho",
      abertoEm: new Date(CADASTRO.getTime() - 6 * MS_POR_DIA),
      ordem: 1,
      origemId: "sempre-on",
    });
    const futuro = toque({
      clickId: "clk_depois",
      abertoEm: new Date(CADASTRO.getTime() + MS_POR_DIA),
      ordem: 2,
      origemId: "tarde-demais",
    });

    const resultado = resolverAtribuicao({
      toques: [futuro, valido],
      cadastradoEm: CADASTRO,
      janelaDias: 7,
    });

    expect(resultado.origem.clickId).toBe("clk_velho");
    expect(resultado.toquesConsiderados.find((item) => item.clickId === "clk_depois")).toMatchObject({
      escolhido: false,
      dentroDaJanela: false,
      motivoCodigo: "posterior_ao_cadastro",
    });
  });

  it("marca orgânico quando todo toque está fora da janela e explica cada um", () => {
    const resultado = resolverAtribuicao({
      toques: [
        toque({
          clickId: "clk_antigo",
          abertoEm: new Date(CADASTRO.getTime() - 8 * MS_POR_DIA),
          origemId: "campanha-passada",
        }),
      ],
      cadastradoEm: CADASTRO,
      janelaDias: 7,
    });

    expect(resultado.origem.tipo).toBe("organico");
    expect(resultado.motivoCodigo).toBe("sem_toque_valido");
    expect(resultado.toquesConsiderados[0]).toMatchObject({
      clickId: "clk_antigo",
      escolhido: false,
      dentroDaJanela: false,
      motivoCodigo: "fora_da_janela",
    });
    expect(resultado.toquesConsiderados[0]?.motivo).toContain("7 dias");
  });

  it("inclui o instante exato da borda e exclui 1 ms antes e 1 ms depois", () => {
    const inicio = inicioDaJanela(CADASTRO, 7);
    const resultado = resolverAtribuicao({
      toques: [
        toque({
          clickId: "clk_antes",
          abertoEm: new Date(inicio.getTime() - 1),
          ordem: 1,
        }),
        toque({
          clickId: "clk_borda",
          abertoEm: new Date(inicio.getTime()),
          ordem: 2,
          origemId: "na-borda",
        }),
        toque({
          clickId: "clk_agora",
          abertoEm: new Date(CADASTRO.getTime()),
          ordem: 3,
          origemId: "no-cadastro",
        }),
        toque({
          clickId: "clk_depois",
          abertoEm: new Date(CADASTRO.getTime() + 1),
          ordem: 4,
        }),
      ],
      cadastradoEm: CADASTRO,
      janelaDias: 7,
    });

    expect(resultado.origem).toMatchObject({ clickId: "clk_agora", origemId: "no-cadastro" });
    const porId = Object.fromEntries(
      resultado.toquesConsiderados.map((item) => [item.clickId, item.motivoCodigo]),
    );
    expect(porId).toEqual({
      clk_antes: "fora_da_janela",
      clk_borda: "anterior_na_janela",
      clk_agora: "escolhido",
      clk_depois: "posterior_ao_cadastro",
    });
  });

  it("desempata horário igual pela maior ordem de gravação", () => {
    const abertoEm = new Date(CADASTRO.getTime() - MS_POR_DIA);
    const resultado = resolverAtribuicao({
      toques: [
        toque({ clickId: "clk_a", abertoEm, ordem: 1, origemId: "primeira" }),
        toque({ clickId: "clk_b", abertoEm, ordem: 4, origemId: "gravada-depois", tipo: "indicacao" }),
      ],
      cadastradoEm: CADASTRO,
      janelaDias: 7,
    });

    expect(resultado.origem).toMatchObject({
      clickId: "clk_b",
      origemId: "gravada-depois",
      tipo: "indicacao",
    });
    expect(resultado.motivo).toContain("Empate de horário");
    expect(resultado.toquesConsiderados.find((item) => item.clickId === "clk_a")).toMatchObject({
      motivoCodigo: "empate_de_horario",
      escolhido: false,
    });
    expect(resultado.toquesConsiderados.find((item) => item.clickId === "clk_b")?.motivo).toContain(
      "ordem de gravação",
    );
  });

  it("colapsa o mesmo click_id e fica com a primeira gravação", () => {
    const resultado = resolverAtribuicao({
      toques: [
        toque({
          clickId: "clk_1",
          abertoEm: new Date(CADASTRO.getTime() - 2 * MS_POR_DIA),
          ordem: 1,
          origemId: "original",
        }),
        toque({
          clickId: "clk_1",
          abertoEm: new Date(CADASTRO.getTime() - MS_POR_DIA),
          ordem: 2,
          origemId: "repetido",
        }),
      ],
      cadastradoEm: CADASTRO,
      janelaDias: 7,
    });

    expect(resultado.toquesConsiderados).toHaveLength(1);
    expect(resultado.toquesConsiderados[0]).toMatchObject({
      origemId: "original",
      ordem: 1,
      escolhido: true,
    });
  });

  it("muda o vencedor quando a janela configurada muda", () => {
    const toques = [
      toque({
        clickId: "clk_antigo",
        abertoEm: new Date(CADASTRO.getTime() - 10 * MS_POR_DIA),
        origemId: "campanha-longa",
      }),
    ];

    const curta = resolverAtribuicao({ toques, cadastradoEm: CADASTRO, janelaDias: 7 });
    const longa = resolverAtribuicao({ toques, cadastradoEm: CADASTRO, janelaDias: 14 });

    expect(curta.origem.tipo).toBe("organico");
    expect(longa.origem).toMatchObject({
      tipo: "campanha",
      origemId: "campanha-longa",
      clickId: "clk_antigo",
    });
    expect(longa.janelaDias).toBe(14);
  });
});
