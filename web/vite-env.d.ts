/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** endereço do servidor da API quando a interface é publicada em outro domínio (ex.: https://api.exemplo.com) */
  readonly VITE_API_URL?: string;
}
