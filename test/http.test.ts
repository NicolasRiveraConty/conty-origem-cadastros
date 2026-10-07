import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { criarAplicacao } from "../src/servidor.js";
import { MS_POR_DIA } from "../src/tipos.js";
import { relogioManual, type RelogioManual } from "./relogio-manual.js";

const INICIO = new Date("2026-03-01T00:00:00.000Z");

describe("HTTP", () => {
  let app: FastifyInstance | undefined;
  let relogio: RelogioManual;

  afterEach(async () => {
    vi.useRealTimers();
    await app?.close();
    app = undefined;
  });

  async function subir(janelaDias = 7): Promise<FastifyInstance> {
    relogio = relogioManual(INICIO);
    app = await criarAplicacao({ janelaDias, relogio });
    return app;
  }

  it("anuncia a regra e a janela em /saude", async () => {
    const aplicacao = await subir(14);
    const resposta = await aplicacao.inject({ method: "GET", url: "/saude" });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      status: "ok",
      regra: "ultimo_toque_valido",
      janela_dias: 14,
      persistencia: "memoria",
    });
  });

  it("percorre campanha, indicação e cadastro, e a auditoria explica a escolha", async () => {
    const aplicacao = await subir();

    const campanha = await aplicacao.inject({
      method: "POST",
      url: "/aberturas",
      payload: {
        click_id: "clk_bf_8f3a",
        device_id: "install_iphone_01",
        tipo: "campanha",
        origem_id: "black-friday-2026",
      },
    });
    expect(campanha.statusCode).toBe(201);

    relogio.avancarMs(2 * MS_POR_DIA);

    const indicacao = await aplicacao.inject({
      method: "POST",
      url: "/aberturas",
      payload: {
        click_id: "clk_ind_91c2",
        device_id: "install_iphone_01",
        tipo: "indicacao",
        origem_id: "convite_maria_042",
      },
    });
    expect(indicacao.statusCode).toBe(201);

    relogio.avancarMs(MS_POR_DIA);

    const cadastro = await aplicacao.inject({
      method: "POST",
      url: "/cadastros",
      payload: { cadastro_id: "criador_42", device_id: "install_iphone_01" },
    });
    expect(cadastro.statusCode).toBe(201);
    expect(cadastro.json()).toMatchObject({
      cadastro_id: "criador_42",
      device_id: "install_iphone_01",
      regra: "ultimo_toque_valido",
      janela_dias: 7,
      criado: true,
      origem: {
        tipo: "indicacao",
        origem_id: "convite_maria_042",
        click_id: "clk_ind_91c2",
      },
      motivo_codigo: "ultimo_toque_valido",
      toques_considerados: [
        {
          click_id: "clk_bf_8f3a",
          tipo: "campanha",
          origem_id: "black-friday-2026",
          escolhido: false,
          dentro_da_janela: true,
          motivo_codigo: "anterior_na_janela",
        },
        {
          click_id: "clk_ind_91c2",
          tipo: "indicacao",
          origem_id: "convite_maria_042",
          escolhido: true,
          dentro_da_janela: true,
          motivo_codigo: "escolhido",
        },
      ],
    });

    const leitura = await aplicacao.inject({
      method: "GET",
      url: "/cadastros/criador_42",
    });
    expect(leitura.statusCode).toBe(200);
    const relido = leitura.json() as { criado?: boolean; origem: { click_id: string } };
    expect(relido.criado).toBeUndefined();
    expect(relido.origem.click_id).toBe("clk_ind_91c2");

    const repetido = await aplicacao.inject({
      method: "POST",
      url: "/cadastros",
      payload: { cadastro_id: "criador_42", device_id: "install_iphone_01" },
    });
    expect(repetido.statusCode).toBe(200);
    expect(repetido.json()).toMatchObject({ criado: false, origem: { click_id: "clk_ind_91c2" } });
  });

  it("grava orgânico explícito quando o device não tem toque", async () => {
    const aplicacao = await subir();
    const resposta = await aplicacao.inject({
      method: "POST",
      url: "/cadastros",
      payload: { cadastro_id: "criador_sem_link", device_id: "install_vazio" },
    });

    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json() as {
      origem: { tipo: string; origem_id: string | null; click_id: string | null };
      motivo_codigo: string;
      janela_dias: number;
      toques_considerados: unknown[];
    };
    expect(corpo.origem).toEqual({
      tipo: "organico",
      origem_id: null,
      click_id: null,
    });
    expect(Object.hasOwn(corpo.origem, "origem_id")).toBe(true);
    expect(Object.hasOwn(corpo.origem, "click_id")).toBe(true);
    expect(corpo.motivo_codigo).toBe("sem_toque_valido");
    expect(corpo.janela_dias).toBe(7);
    expect(corpo.toques_considerados).toEqual([]);
  });

  it("responde 200 na repetição do mesmo clique e 409 se a origem mudar", async () => {
    const aplicacao = await subir();
    const payload = {
      click_id: "clk_bf_8f3a",
      tipo: "campanha",
      origem_id: "black-friday-2026",
    };
    const criado = await aplicacao.inject({ method: "POST", url: "/cliques", payload });
    const repetido = await aplicacao.inject({ method: "POST", url: "/cliques", payload });
    const conflito = await aplicacao.inject({
      method: "POST",
      url: "/cliques",
      payload: { ...payload, origem_id: "outra-campanha" },
    });

    expect(criado.statusCode).toBe(201);
    expect(criado.json()).toMatchObject({ criado: true, clicado_em: INICIO.toISOString() });
    expect(repetido.statusCode).toBe(200);
    expect(repetido.json()).toMatchObject({
      criado: false,
      clicado_em: INICIO.toISOString(),
    });
    expect(conflito.statusCode).toBe(409);
    expect(conflito.json()).toMatchObject({ erro: "click_id_conflito" });
  });

  it("rejeita corpo inválido e cadastro desconhecido", async () => {
    const aplicacao = await subir();

    const incompleto = await aplicacao.inject({
      method: "POST",
      url: "/cliques",
      payload: { tipo: "campanha" },
    });
    const jsonRuim = await aplicacao.inject({
      method: "POST",
      url: "/cliques",
      headers: { "content-type": "application/json" },
      payload: "{",
    });
    const ausente = await aplicacao.inject({
      method: "GET",
      url: "/cadastros/nao_existe",
    });
    const rota = await aplicacao.inject({ method: "GET", url: "/nao-existe" });

    expect(incompleto.statusCode).toBe(400);
    expect(incompleto.json()).toMatchObject({ erro: "payload_invalido" });
    expect(jsonRuim.statusCode).toBe(400);
    expect(ausente.statusCode).toBe(404);
    expect(ausente.json()).toMatchObject({ erro: "cadastro_desconhecido" });
    expect(rota.statusCode).toBe(404);
    expect(rota.json()).toMatchObject({ erro: "rota_desconhecida" });
  });

  it("usa o relógio do sistema quando o corpo não traz ocorrido_em", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    app = await criarAplicacao({ janelaDias: 7 });

    const resposta = await app.inject({
      method: "POST",
      url: "/cliques",
      payload: {
        click_id: "clk_relogio",
        tipo: "campanha",
        origem_id: "sempre-on",
      },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({ clicado_em: "2026-04-01T00:00:00.000Z" });
  });
});
