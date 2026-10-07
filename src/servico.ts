import type { Relogio } from "./relogio.js";
import { relogioDoSistema } from "./relogio.js";
import { resolverAtribuicao } from "./resolver.js";
import type { NovaAbertura, RepositorioAtribuicao } from "./repositorio.js";
import {
  JANELA_PADRAO_DIAS,
  REGRA_ULTIMO_TOQUE,
  type Abertura,
  type Clique,
  type DecisaoCadastro,
  type Gravacao,
  type Toque,
} from "./tipos.js";
import {
  ErroDeAtribuicao,
  exigirData,
  exigirId,
  exigirJanelaDias,
  exigirTipo,
} from "./validacao.js";

export interface OpcoesServico {
  janelaDias?: number;
  relogio?: Relogio;
}

export interface EntradaClique {
  clickId: unknown;
  tipo: unknown;
  origemId: unknown;
  ocorridoEm?: Date;
}

export interface EntradaAbertura {
  clickId: unknown;
  deviceId: unknown;
  tipo?: unknown;
  origemId?: unknown;
  ocorridoEm?: Date;
}

export interface EntradaCadastro {
  cadastroId: unknown;
  deviceId: unknown;
  ocorridoEm?: Date;
}

export class ServicoAtribuicao {
  readonly regra = REGRA_ULTIMO_TOQUE;
  readonly janelaDias: number;
  private readonly relogio: Relogio;

  constructor(
    private readonly repositorio: RepositorioAtribuicao,
    opcoes: OpcoesServico = {},
  ) {
    this.janelaDias = exigirJanelaDias(opcoes.janelaDias ?? JANELA_PADRAO_DIAS);
    this.relogio = opcoes.relogio ?? relogioDoSistema;
  }

  async registrarClique(entrada: EntradaClique): Promise<Gravacao<Clique>> {
    return this.repositorio.inserirClique({
      clickId: exigirId("click_id", entrada.clickId),
      tipo: exigirTipo(entrada.tipo),
      origemId: exigirId("origem_id", entrada.origemId),
      clicadoEm: this.quando(entrada.ocorridoEm),
    });
  }

  /**
   * Primeira abertura do click_id no device. Repetir o mesmo par devolve o
   * registro original, com o mesmo abertoEm — a janela não é renovada.
   * Se o clique ainda não existe, tipo e origem_id (lidos do link) o criam.
   */
  async registrarAbertura(entrada: EntradaAbertura): Promise<Gravacao<Abertura>> {
    const clickId = exigirId("click_id", entrada.clickId);
    const deviceId = exigirId("device_id", entrada.deviceId);
    const quando = this.quando(entrada.ocorridoEm);
    await this.garantirClique(clickId, entrada.tipo, entrada.origemId, quando);

    const nova: NovaAbertura = { clickId, deviceId, abertoEm: quando };
    return this.repositorio.inserirAbertura(nova);
  }

  /**
   * Consome os toques do device e grava a decisão. Repetir o mesmo cadastro_id
   * devolve a auditoria já gravada, sem recalcular.
   */
  async registrarCadastro(entrada: EntradaCadastro): Promise<Gravacao<DecisaoCadastro>> {
    const cadastroId = exigirId("cadastro_id", entrada.cadastroId);
    const deviceId = exigirId("device_id", entrada.deviceId);

    const existente = await this.repositorio.obterDecisao(cadastroId);
    if (existente) {
      if (existente.deviceId !== deviceId) {
        throw new ErroDeAtribuicao(
          "cadastro_conflito",
          "Este cadastro_id já tem uma decisão gravada para outro device.",
          409,
        );
      }
      return { registro: existente, criado: false };
    }

    const quando = this.quando(entrada.ocorridoEm);
    const toques = await this.toquesDoDevice(deviceId);
    const resultado = resolverAtribuicao({
      toques,
      cadastradoEm: quando,
      janelaDias: this.janelaDias,
    });

    return this.repositorio.inserirDecisao({
      cadastroId,
      deviceId,
      cadastradoEm: quando,
      ...resultado,
    });
  }

  async buscarCadastro(cadastroId: unknown): Promise<DecisaoCadastro> {
    const id = exigirId("cadastro_id", cadastroId);
    const decisao = await this.repositorio.obterDecisao(id);
    if (decisao === null) {
      throw new ErroDeAtribuicao(
        "cadastro_desconhecido",
        "Não há decisão gravada para esse cadastro.",
        404,
      );
    }
    return decisao;
  }

  private async garantirClique(
    clickId: string,
    tipo: unknown,
    origemId: unknown,
    quando: Date,
  ): Promise<void> {
    const informouTipo = tipo !== undefined;
    const informouOrigem = origemId !== undefined;
    if (informouTipo !== informouOrigem) {
      throw new ErroDeAtribuicao(
        "payload_invalido",
        "tipo e origem_id devem vir juntos, como no link.",
        400,
      );
    }

    const existente = await this.repositorio.obterClique(clickId);
    if (existente === null) {
      if (!informouTipo || !informouOrigem) {
        throw new ErroDeAtribuicao(
          "clique_desconhecido",
          "Não há clique com esse click_id. Envie tipo e origem_id lidos do link.",
          404,
        );
      }
      await this.registrarClique({ clickId, tipo, origemId, ocorridoEm: quando });
      return;
    }

    if (!informouTipo || !informouOrigem) return;

    const tipoLido = exigirTipo(tipo);
    const origemLida = exigirId("origem_id", origemId);
    if (tipoLido !== existente.tipo || origemLida !== existente.origemId) {
      throw new ErroDeAtribuicao(
        "click_id_conflito",
        "Este click_id já foi registrado com outro tipo ou origem_id.",
        409,
      );
    }
  }

  private async toquesDoDevice(deviceId: string): Promise<Toque[]> {
    const aberturas = await this.repositorio.listarAberturasDoDevice(deviceId);
    const toques: Toque[] = [];
    for (const abertura of aberturas) {
      const clique = await this.repositorio.obterClique(abertura.clickId);
      if (clique === null) {
        throw new ErroDeAtribuicao(
          "erro_interno",
          `Abertura ${abertura.clickId} sem clique correspondente.`,
          500,
        );
      }
      toques.push({
        clickId: clique.clickId,
        tipo: clique.tipo,
        origemId: clique.origemId,
        clicadoEm: clique.clicadoEm,
        abertoEm: abertura.abertoEm,
        ordem: abertura.ordem,
      });
    }
    return toques;
  }

  private quando(ocorridoEm: Date | undefined): Date {
    if (ocorridoEm === undefined) return this.relogio.agora();
    return exigirData(ocorridoEm, "ocorrido_em");
  }
}
