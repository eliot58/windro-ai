// Значения для валидации конфига: в e2e база и внешние сервисы подменяются
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.TELEGRAM_BOT_TOKEN ??= '123:test';
process.env.API_KEY ??= 'a'.repeat(64);
process.env.PUBLIC_URL ??= 'https://api.example.com';
process.env.TELEGRAM_WEBHOOK_SECRET ??= 'test-secret';
process.env.LLM_API_KEY ??= 'test-key';
