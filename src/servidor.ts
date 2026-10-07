import Fastify, { type FastifyInstance } from "fastify";
import type { Relogio } from "./relogio.js";
import { RepositorioMemoria } from "./repositorio.js";
import { ServicoAtribuicao } from "./servico.js";
import type {
  Abertura,
  Clique,
  DecisaoCadastro,
  Gravacao,
  ToqueConsiderado,
} from "./tipos.js";
import { ErroDeAtribuicao } from "./validacao.js";

export interface OpcoesAplicacao {
  janelaDias?: number;
  relogio?: Relogio;
  servico?: ServicoAtribuicao;
}

export async function criarAplicacao(
  opcoes: OpcoesAplicacao = {},
): Promise<FastifyInstance> {
  const servico =
    opcoes.servico ??
    new ServicoAtribuicao(new RepositorioMemoria(), {
      janelaDias: opcoes.janelaDias,
      relogio: opcoes.relogio,
    });

  const app = Fastify({ logger: false });

  app.setErrorHandler((erro, _requisicao, resposta) => {
    if (erro instanceof ErroDeAtribuicao) {
      return resposta.status(erro.statusHttp).send({
        erro: erro.codigo,
        mensagem: erro.message,
      });
    }
    const statusCode =
      typeof erro === "object" &&
      erro !== null &&
      "statusCode" in erro &&
      typeof erro.statusCode === "number"
        ? erro.statusCode
        : 500;
    if (statusCode >= 400 && statusCode < 500) {
      return resposta.status(statusCode).send({
        erro: "payload_invalido",
        mensagem: "Não foi possível ler o corpo da requisição.",
      });
    }
    return resposta.status(500).send({
      erro: "erro_interno",
      mensagem: "Erro interno.",
    });
  });

  app.setNotFoundHandler((_requisicao, resposta) => {
    return resposta.status(404).send({
      erro: "rota_desconhecida",
      mensagem: "Rota não encontrada.",
    });
  });

  app.get("/saude", async () => ({
    status: "ok",
    regra: servico.regra,
    janela_dias: servico.janelaDias,
    persistencia: "memoria",
  }));

  app.post("/cliques", async (requisicao, resposta) => {
    const gravacao = await servico.registrarClique(lerClique(requisicao.body));
    return resposta.status(gravacao.criado ? 201 : 200).send(cliqueParaJson(gravacao));
  });

  app.post("/aberturas", async (requisicao, resposta) => {
    const gravacao = await servico.registrarAbertura(lerAbertura(requisicao.body));
    return resposta.status(gravacao.criado ? 201 : 200).send(aberturaParaJson(gravacao));
  });

  app.post("/cadastros", async (requisicao, resposta) => {
    const gravacao = await servico.registrarCadastro(lerCadastro(requisicao.body));
    return resposta
      .status(gravacao.criado ? 201 : 200)
      .send({ ...corpoDecisao(gravacao.registro), criado: gravacao.criado });
  });

  app.get("/cadastros/:cadastroId", async (requisicao) => {
    const params = requisicao.params as { cadastroId: string };
    const decisao = await servico.buscarCadastro(params.cadastroId);
    return corpoDecisao(decisao);
  });

  await app.ready();
  return app;
}

function lerClique(corpo: unknown) {
  const json = objeto(corpo);
  return {
    clickId: json.click_id,
    tipo: json.tipo,
    origemId: json.origem_id,
    ocorridoEm: ocorridoEm(json.ocorrido_em),
  };
}

function lerAbertura(corpo: unknown) {
  const json = objeto(corpo);
  return {
    clickId: json.click_id,
    deviceId: json.device_id,
    tipo: json.tipo,
    origemId: json.origem_id,
    ocorridoEm: ocorridoEm(json.ocorrido_em),
  };
}

function lerCadastro(corpo: unknown) {
  const json = objeto(corpo);
  return {
    cadastroId: json.cadastro_id,
    deviceId: json.device_id,
    ocorridoEm: ocorridoEm(json.ocorrido_em),
  };
}

function objeto(corpo: unknown): Record<string, unknown> {
  if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new ErroDeAtribuicao(
      "payload_invalido",
      "O corpo deve ser um objeto JSON.",
      400,
    );
  }
  return corpo as Record<string, unknown>;
}

function ocorridoEm(valor: unknown): Date | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== "string" || Number.isNaN(Date.parse(valor))) {
    throw new ErroDeAtribuicao(
      "payload_invalido",
      "ocorrido_em deve ser uma data ISO-8601.",
      400,
    );
  }
  return new Date(valor);
}

function cliqueParaJson(gravacao: Gravacao<Clique>) {
  const clique = gravacao.registro;
  return {
    click_id: clique.clickId,
    tipo: clique.tipo,
    origem_id: clique.origemId,
    clicado_em: clique.clicadoEm.toISOString(),
    criado: gravacao.criado,
  };
}

function aberturaParaJson(gravacao: Gravacao<Abertura>) {
  const abertura = gravacao.registro;
  return {
    click_id: abertura.clickId,
    device_id: abertura.deviceId,
    aberto_em: abertura.abertoEm.toISOString(),
    ordem: abertura.ordem,
    criado: gravacao.criado,
  };
}

function corpoDecisao(decisao: DecisaoCadastro) {
  return {
    cadastro_id: decisao.cadastroId,
    device_id: decisao.deviceId,
    cadastrado_em: decisao.cadastradoEm.toISOString(),
    regra: decisao.regra,
    janela_dias: decisao.janelaDias,
    janela_inicio: decisao.janelaInicio.toISOString(),
    janela_fim: decisao.janelaFim.toISOString(),
    origem: {
      tipo: decisao.origem.tipo,
      origem_id: decisao.origem.origemId,
      click_id: decisao.origem.clickId,
    },
    motivo_codigo: decisao.motivoCodigo,
    motivo: decisao.motivo,
    toques_considerados: decisao.toquesConsiderados.map(toqueParaJson),
  };
}

function toqueParaJson(toque: ToqueConsiderado) {
  return {
    click_id: toque.clickId,
    tipo: toque.tipo,
    origem_id: toque.origemId,
    clicado_em: toque.clicadoEm.toISOString(),
    aberto_em: toque.abertoEm.toISOString(),
    ordem: toque.ordem,
    dentro_da_janela: toque.dentroDaJanela,
    escolhido: toque.escolhido,
    motivo_codigo: toque.motivoCodigo,
    motivo: toque.motivo,
  };
}
