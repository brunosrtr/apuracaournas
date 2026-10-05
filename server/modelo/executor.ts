// Executa o modelo em várias threads: cada uma ajusta o modelo e simula uma
// fatia dos cenários; o resultado é consolidado na thread principal.
import { Worker } from 'node:worker_threads';
import { consolidar, type EntradaModelo, type ResultadoParte } from './projecao.ts';

interface Pedido { entrada: EntradaModelo; N: number; semente: number; pontual: boolean }

export class ExecutorModelo {
  private workers: Worker[] = [];
  /** uma projeção por vez: as threads respondem em ordem e não podem ser compartilhadas */
  private fila: Promise<unknown> = Promise.resolve();

  constructor(quantidade: number) {
    for (let i = 0; i < quantidade; i++) this.workers.push(new Worker(new URL('./worker.ts', import.meta.url)));
  }

  get threads() { return this.workers.length; }

  private parte(w: Worker, pedido: Pedido): Promise<ResultadoParte> {
    return new Promise((ok, falha) => {
      const aoMsg = (msg: { resultado?: ResultadoParte; erro?: string }) => {
        w.off('error', aoErro);
        if (msg.erro) falha(new Error(msg.erro));
        else ok(msg.resultado!);
      };
      const aoErro = (e: Error) => { w.off('message', aoMsg); falha(e); };
      w.once('message', aoMsg);
      w.once('error', aoErro);
      w.postMessage(pedido);
    });
  }

  rodar(entrada: EntradaModelo, simulacoes: number, semente: number) {
    const tarefa = this.fila.then(() => this.executar(entrada, simulacoes, semente));
    this.fila = tarefa.catch(() => {});
    return tarefa;
  }

  private async executar(entrada: EntradaModelo, simulacoes: number, semente: number) {
    const t0 = performance.now();
    const k = this.workers.length;
    const porThread = Math.ceil(simulacoes / k);
    const partes = await Promise.all(this.workers.map((w, i) =>
      this.parte(w, { entrada, N: porThread, semente: semente + 7919 * i, pontual: i === 0 })));
    return consolidar(entrada, partes, Math.round(performance.now() - t0));
  }
}
