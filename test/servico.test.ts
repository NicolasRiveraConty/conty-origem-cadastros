import { describe, expect, it } from "vitest";
import { RepositorioMemoria } from "../src/repositorio.js";
import { ServicoAtribuicao } from "../src/servico.js";
import { MS_POR_DIA } from "../src/tipos.js";
import { ErroDeAtribuicao } from "../src/validacao.js";
import { relogioManual } from "./relogio-manual.js";

const INICIO = new Date("2026-03-01T00:00:00.000Z");

function servico(janelaDias = 7, inicio = INICIO) {
  const relogio = relogioManual(inicio);
  return {
    relogio,
    servico: new ServicoAtribuicao(new RepositorioMemoria(), { janelaDias, relogio }),
  };
}

describe("ServicoAtribuicao", () => {
  it("não cria duas origens quando o mesmo click_id é registrado de novo", async () => {
    const { servico: atribuicao } = servico();

    const primeiro = await atribuicao.registrarClique({
      clickId: "clk_1",
      tipo: "campanha",
      origemId: "black-friday-2026",
    });
    const segundo = await atribuicao.registrarClique({
      clickId: "clk_1",
      tipo: "campanha",
      origemId: "black-friday-2026",
    });

    expect(primeiro.criado).toBe(true);
    expect(segundo.criado).toBe(false);
    expect(segundo.registro.clicadoEm.toISOString()).toBe(
      primeiro.registro.clicadoEm.toISOString(),
    );
  });

  it("recusa reutilizar o click_id com outra origem", async () => {
    const { servico: atribuicao } = servico();
    await atribuicao.registrarClique({
      clickId: "clk_1",
      tipo: "campanha",
      origemId: "black-friday-2026",
    });

    await expect(
      atribuicao.registrarClique({
        clickId: "clk_1",
        tipo: "indicacao",
        origemId: "convite_maria_042",
      }),
    ).rejects.toMatchObject({ codigo: "click_id_conflito", statusHttp: 409 } satisfies Partial<ErroDeAtribuicao>);
  });

  it("grava a primeira abertura e não renova o horário quando o mesmo clique abre de novo", async () => {
    const { servico: atribuicao, relogio } = servico();

    const primeira = await atribuicao.registrarAbertura({
      clickId: "clk_1",
      deviceId: "install_a",
      tipo: "campanha",
      origemId: "black-friday-2026",
    });
    relogio.avancarMs(6 * MS_POR_DIA);
    const repetida = await atribuicao.registrarAbertura({
      clickId: "clk_1",
      deviceId: "install_a",
      tipo: "campanha",
      origemId: "black-friday-2026",
    });

    expect(repetida.criado).toBe(false);
    expect(repetida.registro.abertoEm.toISOString()).toBe(
      primeira.registro.abertoEm.toISOString(),
    );
    expect(repetida.registro.ordem).toBe(primeira.registro.ordem);

    relogio.avancarMs(2 * MS_POR_DIA);
    const decisao = await atribuicao.registrarCadastro({
      cadastroId: "criador_1",
      deviceId: "install_a",
    });

    expect(decisao.registro.origem.tipo).toBe("organico");
    expect(decisao.registro.toquesConsiderados).toHaveLength(1);
    expect(decisao.registro.toquesConsiderados[0]).toMatchObject({
      clickId: "clk_1",
      motivoCodigo: "fora_da_janela",
      escolhido: false,
    });
  });

  it("não deixa o mesmo clique abrir em outro device", async () => {
    const { servico: atribuicao } = servico();
    await atribuicao.registrarAbertura({
      clickId: "clk_1",
      deviceId: "install_a",
      tipo: "indicacao",
      origemId: "convite_maria_042",
    });

    await expect(
      atribuicao.registrarAbertura({
        clickId: "clk_1",
        deviceId: "install_b",
        tipo: "indicacao",
        origemId: "convite_maria_042",
      }),
    ).rejects.toMatchObject({ codigo: "abertura_conflito", statusHttp: 409 });
  });

  it("exige o clique ou os parâmetros do link na primeira abertura", async () => {
    const { servico: atribuicao } = servico();
    await expect(
      atribuicao.registrarAbertura({ clickId: "clk_sem_clique", deviceId: "install_a" }),
    ).rejects.toMatchObject({ codigo: "clique_desconhecido", statusHttp: 404 });
  });

  it("entre dois links antes do cadastro, credita o último toque válido", async () => {
    const { servico: atribuicao, relogio } = servico();

    await atribuicao.registrarAbertura({
      clickId: "clk_bf_8f3a",
      deviceId: "install_a",
      tipo: "campanha",
      origemId: "black-friday-2026",
    });
    relogio.avancarMs(2 * MS_POR_DIA);
    await atribuicao.registrarAbertura({
      clickId: "clk_ind_91c2",
      deviceId: "install_a",
      tipo: "indicacao",
      origemId: "convite_maria_042",
    });
    relogio.avancarMs(MS_POR_DIA);

    const decisao = await atribuicao.registrarCadastro({
      cadastroId: "criador_42",
      deviceId: "install_a",
    });

    expect(decisao.criado).toBe(true);
    expect(decisao.registro.origem).toEqual({
      tipo: "indicacao",
      origemId: "convite_maria_042",
      clickId: "clk_ind_91c2",
    });
    expect(decisao.registro.janelaDias).toBe(7);
    expect(decisao.registro.toquesConsiderados.map((toque) => toque.motivoCodigo)).toEqual([
      "anterior_na_janela",
      "escolhido",
    ]);
  });

  it("isola a origem por device", async () => {
    const { servico: atribuicao } = servico();
    await atribuicao.registrarAbertura({
      clickId: "clk_a",
      deviceId: "install_a",
      tipo: "campanha",
      origemId: "black-friday-2026",
    });
    await atribuicao.registrarAbertura({
      clickId: "clk_b",
      deviceId: "install_b",
      tipo: "indicacao",
      origemId: "convite_maria_042",
    });

    const cadastroA = await atribuicao.registrarCadastro({
      cadastroId: "criador_a",
      deviceId: "install_a",
    });
    const cadastroB = await atribuicao.registrarCadastro({
      cadastroId: "criador_b",
      deviceId: "install_b",
    });
    const semToque = await atribuicao.registrarCadastro({
      cadastroId: "criador_c",
      deviceId: "install_c",
    });

    expect(cadastroA.registro.origem.clickId).toBe("clk_a");
    expect(cadastroB.registro.origem.clickId).toBe("clk_b");
    expect(semToque.registro.origem).toEqual({
      tipo: "organico",
      origemId: null,
      clickId: null,
    });
  });

  it("usa o horário da primeira abertura, não o do clique, para a janela", async () => {
    const { servico: atribuicao, relogio } = servico();
    await atribuicao.registrarClique({
      clickId: "clk_1",
      tipo: "campanha",
      origemId: "black-friday-2026",
    });
    relogio.avancarMs(10 * MS_POR_DIA);
    await atribuicao.registrarAbertura({
      clickId: "clk_1",
      deviceId: "install_a",
    });

    const decisao = await atribuicao.registrarCadastro({
      cadastroId: "criador_1",
      deviceId: "install_a",
    });

    expect(decisao.registro.origem.clickId).toBe("clk_1");
    const toque = decisao.registro.toquesConsiderados[0];
    expect(toque?.clicadoEm.toISOString()).toBe(INICIO.toISOString());
    expect(toque?.abertoEm.toISOString()).toBe(
      new Date(INICIO.getTime() + 10 * MS_POR_DIA).toISOString(),
    );
    expect(toque?.dentroDaJanela).toBe(true);
  });

  it("congela a auditoria: um toque posterior não reescreve o cadastro", async () => {
    const { servico: atribuicao, relogio } = servico();
    const primeira = await atribuicao.registrarCadastro({
      cadastroId: "criador_1",
      deviceId: "install_a",
    });
    expect(primeira.registro.origem.tipo).toBe("organico");

    relogio.avancarMs(MS_POR_DIA);
    await atribuicao.registrarAbertura({
      clickId: "clk_tarde",
      deviceId: "install_a",
      tipo: "campanha",
      origemId: "black-friday-2026",
    });
    const repetida = await atribuicao.registrarCadastro({
      cadastroId: "criador_1",
      deviceId: "install_a",
    });

    expect(repetida.criado).toBe(false);
    expect(repetida.registro).toEqual(primeira.registro);
    expect(repetida.registro.toquesConsiderados).toEqual([]);
  });

  it("recusa o mesmo cadastro_id em outro device", async () => {
    const { servico: atribuicao } = servico();
    await atribuicao.registrarCadastro({ cadastroId: "criador_1", deviceId: "install_a" });

    await expect(
      atribuicao.registrarCadastro({ cadastroId: "criador_1", deviceId: "install_b" }),
    ).rejects.toMatchObject({ codigo: "cadastro_conflito", statusHttp: 409 });
  });

  it("expira a origem quando o relógio atravessa a janela", async () => {
    const { servico: atribuicao, relogio } = servico();
    await atribuicao.registrarAbertura({
      clickId: "clk_1",
      deviceId: "install_a",
      tipo: "campanha",
      origemId: "black-friday-2026",
    });
    relogio.avancarMs(7 * MS_POR_DIA);
    const noLimite = await atribuicao.registrarCadastro({
      cadastroId: "criador_limite",
      deviceId: "install_a",
    });
    expect(noLimite.registro.origem.clickId).toBe("clk_1");

    const { servico: outro, relogio: relogioOutro } = servico();
    await outro.registrarAbertura({
      clickId: "clk_2",
      deviceId: "install_a",
      tipo: "campanha",
      origemId: "black-friday-2026",
    });
    relogioOutro.avancarMs(7 * MS_POR_DIA + 1);
    const vencido = await outro.registrarCadastro({
      cadastroId: "criador_vencido",
      deviceId: "install_a",
    });
    expect(vencido.registro.origem.tipo).toBe("organico");
    expect(vencido.registro.toquesConsiderados[0]?.motivoCodigo).toBe("fora_da_janela");
  });
});
