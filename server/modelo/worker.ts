import { parentPort } from 'node:worker_threads';
import { projetarParte, type EntradaModelo } from './projecao.ts';

parentPort!.on('message', (p: { entrada: EntradaModelo; N: number; semente: number; pontual: boolean }) => {
  try {
    parentPort!.postMessage({ resultado: projetarParte(p.entrada, p.N, p.semente, p.pontual) });
  } catch (e) {
    parentPort!.postMessage({ erro: (e as Error).stack ?? String(e) });
  }
});
