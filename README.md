# Origem do cadastro

Contrato de atribuição da Conty: o que viaja no link, o que a primeira abertura grava no app e como o cadastro escolhe a origem.

Comece por este arquivo. A regra está em [`src/resolver.ts`](src/resolver.ts). Os casos do enunciado estão em [`test/resolver.test.ts`](test/resolver.test.ts) e [`test/servico.test.ts`](test/servico.test.ts). A API fina está em [`src/servidor.ts`](src/servidor.ts).

## Como rodar

Requer Node 20+.

```bash
npm install
npm test
npm start
```

`npm test` roda a suíte Vitest. `npm start` sobe a API em `http://localhost:3000`.

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP |
| `JANELA_ATRIBUICAO_DIAS` | `7` | Janela de validade, inteiro de 1 a 365 |

A persistência é em memória, atrás de `RepositorioAtribuicao`. O processo reiniciado esquece cliques, aberturas e decisões.

`GET /saude` devolve a regra e a janela em vigor.

## Contrato

O webview muitas vezes não manda referrer. A origem viaja na própria URL e o app a lê na primeira abertura.

O link leva três parâmetros:

| Parâmetro | Significado |
| --- | --- |
| `tipo` | `campanha` ou `indicacao` |
| `id` | Id da campanha ou do convite |
| `click_id` | Id único daquele clique. Um clique, um id |

`organico` não vai no link. É o resultado do cadastro quando não há toque válido.

Quem emite o link gera um `click_id` novo por clique. Reusar o mesmo id é o mesmo clique, não um toque novo.

1. `POST /cliques` registra o clique. O mesmo `click_id` com o mesmo `tipo` e `origem_id` devolve o registro original (`criado: false`) e não move `clicado_em`. Outro `tipo` ou `origem_id` no mesmo id responde `409`.
2. `POST /aberturas` grava a primeira abertura no install (`device_id`). O app manda o `click_id` lido da URL. Se o clique ainda não existe, manda também `tipo` e `origem_id`. Repetir o mesmo `click_id` no mesmo device devolve a primeira gravação: `aberto_em` não é renovado. Outro device no mesmo `click_id` responde `409`.
3. `POST /cadastros` consome os toques daquele `device_id`, aplica a regra e grava a auditoria. Repetir o mesmo `cadastro_id` devolve a decisão já gravada, sem recalcular.
4. `GET /cadastros/:cadastroId` relê essa decisão.

A janela usa `aberto_em` (quando o install capturou a origem), não `clicado_em`. Os dois horários ficam na auditoria. Se só a abertura é chamada, os dois nascem iguais, porque o clique anterior não foi observado.

`ocorrido_em` (ISO-8601) é opcional em todos os posts. Sem ele, vale o relógio do servidor.

## Exemplos de link

Campanha:

```text
https://app.conty.com/r?tipo=campanha&id=black-friday-2026&click_id=clk_bf_8f3a
```

Indicação:

```text
https://app.conty.com/r?tipo=indicacao&id=convite_maria_042&click_id=clk_ind_91c2
```

O `id` do link é o `origem_id` do JSON. `montarLink` e `parametrosDoLink` em [`src/link.ts`](src/link.ts) montam e leem esses parâmetros.

Abertura da campanha e, em seguida, da indicação no mesmo install. A segunda requisição é o toque mais recente, então a indicação vence:

```bash
curl -s -X POST localhost:3000/aberturas \
  -H 'content-type: application/json' \
  -d '{"click_id":"clk_bf_8f3a","device_id":"install_iphone_01","tipo":"campanha","origem_id":"black-friday-2026"}'

curl -s -X POST localhost:3000/aberturas \
  -H 'content-type: application/json' \
  -d '{"click_id":"clk_ind_91c2","device_id":"install_iphone_01","tipo":"indicacao","origem_id":"convite_maria_042"}'

curl -s -X POST localhost:3000/cadastros \
  -H 'content-type: application/json' \
  -d '{"cadastro_id":"criador_42","device_id":"install_iphone_01"}'
```

Nesse intervalo a indicação vence. Os dois toques aparecem em `toques_considerados`.

Cadastro sem abertura nenhuma:

```json
"origem": { "tipo": "organico", "origem_id": null, "click_id": null }
```

Os campos `origem_id` e `click_id` vêm `null`. A ausência de origem não é um campo omitido.

## Regra de vitória

**Último toque válido dentro da janela** (`ultimo_toque_valido`).

Campanha e indicação disputam o crédito do cadastro. O toque mais recente que ainda está na janela é o que estava na mão do criador na hora de criar a conta — é o que o time deve repetir. Os anteriores permanecem na auditoria para mostrar o caminho, e não viram a origem creditada.

Entre toques com o mesmo `aberto_em`, vence a maior ordem de gravação (o que foi persistido depois). O `click_id` entra uma vez: se a lista trouxer duplicata, fica a menor ordem, que é a primeira abertura.

## Janela

Padrão de **7 dias**, configurável por `JANELA_ATRIBUICAO_DIAS` ou pelo construtor de `ServicoAtribuicao`.

O intervalo é fechado nos dois lados: `[cadastrado_em - janela, cadastrado_em]`, em milissegundos (`dias * 86_400_000`), ancorado em `aberto_em`. Um toque exatamente 7 dias antes do cadastro ainda vale. Um milissegundo antes, não. A medida não usa dia de calendário, então fuso e horário de verão não deslocam o corte.

Sete dias dão tempo para quem abre o link, olha a comunidade e volta. Um clique do mês passado não explica o cadastro de hoje. A decisão pronta traz `janela_dias`, `janela_inicio` e `janela_fim`, também quando a origem é orgânica.

A primeira abertura fixa `aberto_em`. Abrir o mesmo link de novo não empurra a janela para a frente.

## Auditoria

Cada decisão guarda a regra, a janela, a origem escolhida, um `motivo` e todos os toques considerados. Cada toque tem `dentro_da_janela`, `escolhido`, `motivo_codigo` e `motivo`.

| `motivo_codigo` | Papel |
| --- | --- |
| `escolhido` | Último toque válido |
| `anterior_na_janela` | Válido, mais antigo que o escolhido |
| `empate_de_horario` | Mesmo horário; perdeu pela ordem de gravação |
| `fora_da_janela` | Aberto antes do início da janela |
| `posterior_ao_cadastro` | Aberto depois do cadastro |
| `sem_toque_valido` | Na decisão: origem `organico` |

`GET /cadastros/:cadastroId` devolve essa trilha. Repetir o `POST /cadastros` não recalcula: a explicação fica estável mesmo se um toque novo chegar depois.

## O que ficou de fora

- Persistência durável (SQLite ou Postgres) e mais de um processo. A interface `RepositorioAtribuicao` isola isso; a implementação entregue é `RepositorioMemoria`.
- Autenticação, geração do `click_id` na borda e redirect do link curto.
- Atribuição entre devices (clique no celular, cadastro no desktop) e reinstalação, que troca o `device_id`.
- Fingerprint para quando a query string se perde.
- First-touch. A regra escolhida é last-touch dentro da janela.

## Uso de IA

O código deste repositório foi gerado por um agente de IA (Cursor).

Revisado por Nicolas: [preencher]
