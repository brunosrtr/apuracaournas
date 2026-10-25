/// <reference types="vite/client" />

/** verdadeiro quando a interface foi compilada pela Vercel (ativa o Web Analytics) */
declare const __NA_VERCEL__: boolean;

interface ImportMetaEnv {
  /** endereço do servidor da API quando a interface é publicada em outro domínio (ex.: https://api.exemplo.com) */
  readonly VITE_API_URL?: string;
}
