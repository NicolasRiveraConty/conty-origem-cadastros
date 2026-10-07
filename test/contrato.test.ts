import { describe, expect, it } from "vitest";
import { lerJanelaDias, lerPorta } from "../src/config.js";
import {
  EXEMPLO_CAMPANHA,
  EXEMPLO_INDICACAO,
  URL_BASE_DO_LINK,
  montarLink,
  parametrosDoLink,
} from "../src/link.js";
import { ErroDeAtribuicao } from "../src/validacao.js";

describe("link", () => {
  it("monta e lê o link de campanha", () => {
    const url = montarLink(URL_BASE_DO_LINK, EXEMPLO_CAMPANHA);
    expect(url).toBe(
      "https://app.conty.com/r?tipo=campanha&id=black-friday-2026&click_id=clk_bf_8f3a",
    );
    expect(parametrosDoLink(url)).toEqual(EXEMPLO_CAMPANHA);
  });

  it("monta e lê o link de indicação", () => {
    const url = montarLink(URL_BASE_DO_LINK, EXEMPLO_INDICACAO);
    expect(url).toBe(
      "https://app.conty.com/r?tipo=indicacao&id=convite_maria_042&click_id=clk_ind_91c2",
    );
    expect(parametrosDoLink(url)).toEqual(EXEMPLO_INDICACAO);
  });

  it("recusa orgânico e link sem click_id", () => {
    expect(() =>
      parametrosDoLink("https://app.conty.com/r?tipo=organico&id=x&click_id=clk_1"),
    ).toThrow(ErroDeAtribuicao);
    expect(() =>
      parametrosDoLink("https://app.conty.com/r?tipo=campanha&id=black-friday-2026"),
    ).toThrow(ErroDeAtribuicao);
  });
});

describe("configuração", () => {
  it("usa 7 dias e a porta 3000 quando o ambiente não define nada", () => {
    expect(lerJanelaDias({})).toBe(7);
    expect(lerPorta(undefined)).toBe(3000);
  });

  it("lê a janela e recusa valor inválido", () => {
    expect(lerJanelaDias({ JANELA_ATRIBUICAO_DIAS: "14" })).toBe(14);
    expect(() => lerJanelaDias({ JANELA_ATRIBUICAO_DIAS: "0" })).toThrow(/JANELA_ATRIBUICAO_DIAS/);
    expect(() => lerJanelaDias({ JANELA_ATRIBUICAO_DIAS: "abc" })).toThrow(/JANELA_ATRIBUICAO_DIAS/);
    expect(() => lerPorta("70000")).toThrow(/PORT/);
  });
});
