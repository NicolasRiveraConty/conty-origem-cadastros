import { lerJanelaDias, lerPorta } from "./config.js";
import { criarAplicacao } from "./servidor.js";

const janelaDias = lerJanelaDias();
const porta = lerPorta(process.env.PORT);
const app = await criarAplicacao({ janelaDias });

try {
  await app.listen({ port: porta, host: "0.0.0.0" });
} catch (erro) {
  console.error(erro);
  process.exit(1);
}

console.log(
  `origem-cadastros na porta ${porta} (regra ultimo_toque_valido, janela ${janelaDias} dias)`,
);
