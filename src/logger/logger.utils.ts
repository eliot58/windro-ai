// Красивый цветной вывод логов в консоль; в тестах отключён
export function transport(nodeEnv: string) {
  if (nodeEnv === 'test') {
    return {};
  }
  return {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  };
}
