// Cores por partido (número da legenda). Escolhidas para serem distinguíveis
// entre os principais concorrentes e legíveis em fundo claro e escuro.
export const CORES_PARTIDO: Record<string, string> = {
  '13': '#e03131', // PT
  '22': '#1d4ed8', // PL
  '55': '#f59f00', // PSD
  '30': '#f76707', // NOVO
  '15': '#2f9e44', // MDB
  '12': '#c2255c', // PDT
  '45': '#1c7ed6', // PSDB
  '40': '#fab005', // PSB
  '50': '#9c36b5', // PSOL
  '10': '#0c8599', // REPUBLICANOS
  '44': '#3b5bdb', // UNIÃO
  '11': '#4dabf7', // PP
  '70': '#12b886', // AVANTE
  '14': '#7048e8', // MISSÃO
  '16': '#a61e4d', // PSTU
  '21': '#862e9c', // PCB
  '29': '#5f3dc4', // PCO
  '80': '#d9480f', // UP
  '27': '#66a80f', // DC
  '35': '#868e96', // DEMOCRATA
  '43': '#37b24d', // PV
  '65': '#c92a2a', // PCdoB
  '18': '#20c997', // REDE
  '19': '#e64980', // PODE
  '20': '#5c7cfa', // PSC
  '77': '#fd7e14', // SOLIDARIEDADE
  '36': '#748ffc', // AGIR
  '23': '#ff922b', // CIDADANIA
  '28': '#40c057', // PRTB
  '33': '#f06595', // PMN
  '25': '#2b8a3e', // PRD
  '17': '#4263eb', // PSL (2018)
};

const RESERVA = ['#495057', '#0b7285', '#5f3dc4', '#e8590c', '#2b8a3e', '#c2255c', '#1864ab', '#a61e4d', '#087f5b', '#862e9c'];

export function corPartido(numero: string, indice = 0): string {
  return CORES_PARTIDO[numero.slice(0, 2)] ?? RESERVA[indice % RESERVA.length];
}

/** Atribui cores garantindo que candidatos diferentes não repitam a mesma cor. */
export function atribuirCores(numeros: string[]): Record<string, string> {
  const usadas = new Set<string>();
  const saida: Record<string, string> = {};
  numeros.forEach((n, i) => {
    let cor = corPartido(n, i);
    let k = 0;
    while (usadas.has(cor) && k < RESERVA.length) cor = RESERVA[(i + k++) % RESERVA.length];
    usadas.add(cor);
    saida[n] = cor;
  });
  return saida;
}

export const SIGLAS_PARTIDO: Record<string, string> = {
  '10': 'REPUBLICANOS', '11': 'PP', '12': 'PDT', '13': 'PT', '14': 'PTB', '15': 'MDB', '16': 'PSTU',
  '17': 'PSL', '18': 'REDE', '19': 'PODE', '20': 'PSC', '21': 'PCB', '22': 'PL', '23': 'CIDADANIA',
  '25': 'DEM', '27': 'DC', '28': 'PRTB', '29': 'PCO', '30': 'NOVO', '33': 'PMN', '35': 'PMB',
  '36': 'AGIR', '40': 'PSB', '43': 'PV', '44': 'UNIÃO', '45': 'PSDB', '50': 'PSOL', '51': 'PATRIOTA',
  '55': 'PSD', '65': 'PCdoB', '70': 'AVANTE', '77': 'SOLIDARIEDADE', '80': 'UP', '90': 'PROS',
};
