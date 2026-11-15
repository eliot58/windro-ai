import { HttpsProxyAgent } from 'https-proxy-agent';

// Настройки axios для запросов через прокси. Переменные HTTP_PROXY не учитываются
export const proxyOptions = (proxyUrl?: string) => ({
  proxy: false as const,
  ...(proxyUrl && { httpsAgent: new HttpsProxyAgent(proxyUrl) }),
});
