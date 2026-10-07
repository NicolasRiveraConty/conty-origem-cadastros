import type {
  Abertura,
  Clique,
  DecisaoCadastro,
  Gravacao,
  ToqueConsiderado,
} from "./tipos.js";
import { ErroDeAtribuicao } from "./validacao.js";

export interface NovaAbertura {
  clickId: string;
  deviceId: string;
  abertoEm: Date;
}

export interface RepositorioAtribuicao {
  inserirClique(clique: Clique): Promise<Gravacao<Clique>>;
  obterClique(clickId: string): Promise<Clique | null>;
  inserirAbertura(abertura: NovaAbertura): Promise<Gravacao<Abertura>>;
  listarAberturasDoDevice(deviceId: string): Promise<Abertura[]>;
  inserirDecisao(decisao: DecisaoCadastro): Promise<Gravacao<DecisaoCadastro>>;
  obterDecisao(cadastroId: string): Promise<DecisaoCadastro | null>;
}

/**
 * Guarda o processo. A checagem e a gravação acontecem sem await no meio,
 * então um click_id não vira duas origens mesmo com requisições concorrentes
 * no mesmo processo.
 */
export class RepositorioMemoria implements RepositorioAtribuicao {
  private readonly cliques = new Map<string, Clique>();
  private readonly aberturas = new Map<string, Abertura>();
  private readonly porDevice = new Map<string, string[]>();
  private readonly decisoes = new Map<string, DecisaoCadastro>();
  private proximaOrdem = 1;

  async inserirClique(clique: Clique): Promise<Gravacao<Clique>> {
    const existente = this.cliques.get(clique.clickId);
    if (existente) {
      if (existente.tipo === clique.tipo && existente.origemId === clique.origemId) {
        return { registro: copiarClique(existente), criado: false };
      }
      throw new ErroDeAtribuicao(
        "click_id_conflito",
        "Este click_id já foi registrado com outro tipo ou origem_id.",
        409,
      );
    }
    const gravado = copiarClique(clique);
    this.cliques.set(clique.clickId, gravado);
    return { registro: copiarClique(gravado), criado: true };
  }

  async obterClique(clickId: string): Promise<Clique | null> {
    const clique = this.cliques.get(clickId);
    return clique === undefined ? null : copiarClique(clique);
  }

  async inserirAbertura(nova: NovaAbertura): Promise<Gravacao<Abertura>> {
    const existente = this.aberturas.get(nova.clickId);
    if (existente) {
      if (existente.deviceId === nova.deviceId) {
        return { registro: copiarAbertura(existente), criado: false };
      }
      throw new ErroDeAtribuicao(
        "abertura_conflito",
        "Este click_id já foi gravado na primeira abertura de outro device. O mesmo clique não cria outra origem.",
        409,
      );
    }

    const abertura: Abertura = {
      clickId: nova.clickId,
      deviceId: nova.deviceId,
      abertoEm: new Date(nova.abertoEm.getTime()),
      ordem: this.proximaOrdem,
    };
    this.proximaOrdem += 1;
    this.aberturas.set(nova.clickId, abertura);
    const ids = this.porDevice.get(nova.deviceId) ?? [];
    ids.push(nova.clickId);
    this.porDevice.set(nova.deviceId, ids);
    return { registro: copiarAbertura(abertura), criado: true };
  }

  async listarAberturasDoDevice(deviceId: string): Promise<Abertura[]> {
    const ids = this.porDevice.get(deviceId) ?? [];
    return ids.map((id) => {
      const abertura = this.aberturas.get(id);
      if (abertura === undefined) {
        throw new ErroDeAtribuicao(
          "erro_interno",
          "Abertura indexada não encontrada.",
          500,
        );
      }
      return copiarAbertura(abertura);
    });
  }

  async inserirDecisao(decisao: DecisaoCadastro): Promise<Gravacao<DecisaoCadastro>> {
    const existente = this.decisoes.get(decisao.cadastroId);
    if (existente) {
      if (existente.deviceId !== decisao.deviceId) {
        throw new ErroDeAtribuicao(
          "cadastro_conflito",
          "Este cadastro_id já tem uma decisão gravada para outro device.",
          409,
        );
      }
      return { registro: copiarDecisao(existente), criado: false };
    }
    const gravada = copiarDecisao(decisao);
    this.decisoes.set(decisao.cadastroId, gravada);
    return { registro: copiarDecisao(gravada), criado: true };
  }

  async obterDecisao(cadastroId: string): Promise<DecisaoCadastro | null> {
    const decisao = this.decisoes.get(cadastroId);
    return decisao === undefined ? null : copiarDecisao(decisao);
  }
}

function copiarClique(clique: Clique): Clique {
  return {
    clickId: clique.clickId,
    tipo: clique.tipo,
    origemId: clique.origemId,
    clicadoEm: new Date(clique.clicadoEm.getTime()),
  };
}

function copiarAbertura(abertura: Abertura): Abertura {
  return {
    clickId: abertura.clickId,
    deviceId: abertura.deviceId,
    abertoEm: new Date(abertura.abertoEm.getTime()),
    ordem: abertura.ordem,
  };
}

function copiarDecisao(decisao: DecisaoCadastro): DecisaoCadastro {
  return {
    cadastroId: decisao.cadastroId,
    deviceId: decisao.deviceId,
    cadastradoEm: new Date(decisao.cadastradoEm.getTime()),
    regra: decisao.regra,
    janelaDias: decisao.janelaDias,
    janelaInicio: new Date(decisao.janelaInicio.getTime()),
    janelaFim: new Date(decisao.janelaFim.getTime()),
    origem: { ...decisao.origem },
    motivoCodigo: decisao.motivoCodigo,
    motivo: decisao.motivo,
    toquesConsiderados: decisao.toquesConsiderados.map(copiarToque),
  };
}

function copiarToque(toque: ToqueConsiderado): ToqueConsiderado {
  return {
    ...toque,
    clicadoEm: new Date(toque.clicadoEm.getTime()),
    abertoEm: new Date(toque.abertoEm.getTime()),
  };
}
