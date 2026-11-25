/* eslint-disable @typescript-eslint/no-unsafe-member-access -- данные приходят от модели и из XML, их форма проверяется валидатором */
import { HttpService } from '@nestjs/axios';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { of } from 'rxjs';

import { RecognitionError } from '../src/recognition/recognition.error';
import { API, AUTH, createTestApp, multipart } from './helpers/create-app';
import { createFakePrisma } from './helpers/fake-prisma';
import {
  ApiCall,
  commandUpdate,
  createTestBot,
  documentUpdate,
  textUpdate,
} from './helpers/telegram';

const WEBHOOK = `${API}/telegram/webhook`;
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const CALLBACK_URL = 'https://front.example.com/callback';
const ORDER_ITEMS = [
  { constructionType: 'Окно', width: 1200, height: 1400, qu: 1 },
];
const RESULT = {
  orderItems: ORDER_ITEMS,
  addOrderitems: [],
  cloud: 'Позиция 1: арка',
};

async function until(condition: () => boolean) {
  for (let i = 0; i < 200 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(condition()).toBe(true);
}

describe('App (e2e)', () => {
  let app: NestFastifyApplication;
  let calls: ApiCall[];
  let prisma: ReturnType<typeof createFakePrisma>;
  let post: jest.SpyInstance;
  const recognition = {
    recognize: jest.fn(),
  };
  const proposalServer = { send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    recognition.recognize.mockResolvedValue(RESULT);
    proposalServer.send.mockResolvedValue({ status: 'accepted' });
    const testBot = createTestBot();
    calls = testBot.calls;
    prisma = createFakePrisma();
    app = await createTestApp({
      bot: testBot.bot,
      prisma,
      recognition,
      proposalServer,
    });

    // У каждого модуля свой настроенный HttpService, поэтому подменяем прототип
    post = jest
      .spyOn(HttpService.prototype, 'post')
      .mockReturnValue(of({ status: 200 }) as never);
    jest
      .spyOn(HttpService.prototype, 'get')
      .mockReturnValue(of({ data: new ArrayBuffer(4), status: 200 }) as never);
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  const postUpdate = (payload: object, secret = 'test-secret') =>
    app.inject({
      method: 'POST',
      url: WEBHOOK,
      headers: { [SECRET_HEADER]: secret },
      payload,
    });

  const texts = () =>
    calls
      .filter((call) => call.method === 'sendMessage')
      .map((call) => String(call.payload.text));

  const activateUser = async () => {
    await postUpdate(commandUpdate('/start'));
    await postUpdate(textUpdate('1234-5678'));
    calls.length = 0;
  };

  describe('bot', () => {
    it('sets the webhook on startup', () => {
      const call = calls.find(({ method }) => method === 'setWebhook');
      expect(call?.payload).toMatchObject({
        url: 'https://api.example.com/api/v1/telegram/webhook',
        secret_token: 'test-secret',
      });
    });

    it('rejects a wrong webhook secret', async () => {
      const res = await postUpdate(commandUpdate('/start'), 'wrong');
      expect(res.statusCode).toBe(401);
    });

    it('answers 200 when a handler fails', async () => {
      prisma.user.findUnique = () => Promise.reject(new Error('db is down'));
      const res = await postUpdate(commandUpdate('/start'));
      expect(res.statusCode).toBe(200);
    });

    it('answers /help and unknown commands with help', async () => {
      await postUpdate(commandUpdate('/help'));
      await postUpdate(commandUpdate('/foo'));
      expect(texts()).toHaveLength(2);
      expect(texts().every((text) => text.includes('Что умеет бот'))).toBe(
        true,
      );
    });

    it('ignores group chats', async () => {
      await postUpdate(
        commandUpdate('/start', { id: -1, type: 'group', title: 'G' }),
      );
      expect(texts()).toHaveLength(0);
    });

    it('registers and activates a user', async () => {
      await postUpdate(commandUpdate('/start'));
      expect(texts()[0]).toContain('код продавца');
      expect(calls.at(-1)?.payload.parse_mode).toBe('HTML');

      await postUpdate(textUpdate('плохой код'));
      expect(texts()[1]).toContain('Неверный формат');

      await postUpdate(textUpdate('1234-5678'));
      expect(prisma.users.get(42n)).toMatchObject({
        isActive: true,
        sellerCode: '1234-5678',
      });
      expect(texts()[2]).toContain('Код принят');
    });

    it('ignores text after /logout until /start', async () => {
      await activateUser();
      await postUpdate(commandUpdate('/logout'));
      expect(prisma.users.get(42n)).toMatchObject({
        isActive: false,
        sellerCode: null,
        loggedOut: true,
      });

      calls.length = 0;
      await postUpdate(textUpdate('1234-5678'));
      expect(texts()).toHaveLength(0);

      await postUpdate(commandUpdate('/start'));
      expect(texts()[0]).toContain('код продавца');
    });

    it('rejects a document from an inactive user', async () => {
      await postUpdate(documentUpdate('order.pdf'));
      expect(texts()[0]).toContain('код продавца');
      expect(recognition.recognize).not.toHaveBeenCalled();
    });

    it('answers Telegram at once and processes the order in the background', async () => {
      await activateUser();
      let finish!: (value: typeof RESULT) => void;
      recognition.recognize.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );

      const res = await postUpdate(documentUpdate('order.pdf'));
      expect(res.statusCode).toBe(200);
      expect(texts()[0]).toContain('Обрабатываю');

      await until(() => recognition.recognize.mock.calls.length > 0);
      finish(RESULT);
      await until(() => calls.some((c) => c.method === 'sendDocument'));

      expect(proposalServer.send).toHaveBeenCalledWith(
        '1234-5678',
        ORDER_ITEMS,
        [],
      );
    });

    it('reports a proposal server failure and still sends the result', async () => {
      await activateUser();
      proposalServer.send.mockResolvedValue({
        status: 'failed',
        reason: 'down',
      });
      await postUpdate(documentUpdate('order.pdf'));
      await until(() =>
        texts().some((t) => t.includes('Не удалось заказать КП')),
      );
      expect(calls.some((c) => c.method === 'sendDocument')).toBe(true);
    });

    it('routes an image file to photo recognition', async () => {
      await activateUser();
      await postUpdate(documentUpdate('blank.JPG'));
      await until(() => recognition.recognize.mock.calls.length > 0);
      expect(recognition.recognize.mock.calls[0][0]).toMatchObject({
        kind: 'photo',
      });
    });

    it('rejects an unsupported format and an oversized file', async () => {
      await activateUser();
      await postUpdate(documentUpdate('order.xlsx'));
      await postUpdate(documentUpdate('order.pdf', 21 * 1024 * 1024));
      expect(texts()[0]).toContain('Формат не поддерживается');
      expect(texts()[1]).toContain('Файл больше');
    });

    it('reports why recognition failed', async () => {
      await activateUser();
      recognition.recognize.mockRejectedValue(
        new RecognitionError('нет блоков'),
      );
      await postUpdate(documentUpdate('order.pdf'));
      await until(() =>
        texts().some((t) => t.includes('распознать заявку: нет блоков')),
      );
      expect(proposalServer.send).not.toHaveBeenCalled();
    });

    it('rejects a window below the minimum size', async () => {
      await activateUser();
      recognition.recognize.mockResolvedValue({
        ...RESULT,
        orderItems: [{ constructionType: 'Окно', width: 200, height: 1000 }],
      });
      await postUpdate(documentUpdate('order.pdf'));
      await until(() => texts().some((t) => t.includes('Размер окна меньше')));
      expect(proposalServer.send).not.toHaveBeenCalled();
    });
  });

  describe('proposal server webhook', () => {
    const receive = (fields: Record<string, string>, withFile = true) =>
      app.inject({
        method: 'POST',
        url: `${API}/proposals/webhook`,
        ...multipart(
          fields,
          withFile ? { name: 'kp.pdf', content: '%PDF' } : undefined,
        ),
      });

    it('forwards the PDF to the Telegram user', async () => {
      await activateUser();
      const res = await receive({ sellerCode: '1234-5678', status: 'success' });
      expect(res.json()).toEqual({ status: 'ok' });
      expect(texts()[0]).toContain('КП готово');
      expect(calls.some((c) => c.method === 'sendDocument')).toBe(true);
    });

    it('sends the PDF to everyone with the same seller code', async () => {
      await activateUser();
      prisma.users.set(43n, {
        id: 43n,
        firstName: 'Second',
        isActive: true,
        sellerCode: '1234-5678',
        loggedOut: false,
      });

      await receive({ sellerCode: '1234-5678', status: 'success' });

      const recipients = calls
        .filter((call) => call.method === 'sendDocument')
        .map((call) => call.payload.chat_id);
      expect(recipients.sort()).toEqual([42, 43]);
    });

    it('does not message users with another seller code', async () => {
      await activateUser();
      await receive({ sellerCode: '9999-0000', status: 'success' });
      expect(texts()).toHaveLength(0);
    });

    it('forwards a generation error to the user', async () => {
      await activateUser();
      await receive(
        {
          sellerCode: '1234-5678',
          status: 'error',
          message: 'Сбой',
          error: 'E1',
        },
        false,
      );
      expect(texts()[0]).toBe('❌ Сбой\n\nКод ошибки: E1');
    });

    it('reports an unknown user', async () => {
      const res = await receive({ sellerCode: '0000-0000', status: 'success' });
      expect(res.json()).toEqual({
        status: 'error',
        message: 'User not found',
      });
    });

    it('rejects a webhook without a seller code', async () => {
      const res = await receive({ sellerCode: 'nope', status: 'success' });
      expect(res.statusCode).toBe(400);
    });
  });

  const RECOGNITIONS = `${API}/recognitions`;
  const submit = (
    name = 'order.pdf',
    fields: Record<string, string> = { callback_url: CALLBACK_URL },
  ) =>
    app.inject({
      method: 'POST',
      url: RECOGNITIONS,
      ...multipart(fields, { name, content: 'data' }),
    });

  describe('API key', () => {
    it('rejects a request without a key', async () => {
      const { headers, payload } = multipart(
        { callback_url: CALLBACK_URL },
        { name: 'a.pdf', content: 'x' },
      );
      const res = await app.inject({
        method: 'POST',
        url: RECOGNITIONS,
        headers: { 'content-type': headers['content-type'] },
        payload,
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        code: 'invalid_api_key',
        message: 'Неверный ключ API.',
      });
      expect(recognition.recognize).not.toHaveBeenCalled();
    });

    it('rejects a wrong key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: RECOGNITIONS,
        headers: { 'x-api-key': 'wrong' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  it('accepts the proposal webhook without a key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${API}/proposals/webhook`,
      payload: 'x',
      headers: { 'content-type': 'multipart/form-data; boundary=b' },
    });
    expect(res.statusCode).not.toBe(401);
  });

  describe('recognitions', () => {
    it('sends recognized items to the callback', async () => {
      const res = await submit('order.pdf', {
        callback_url: CALLBACK_URL,
        seller_code: '1111-2222',
      });
      expect(res.statusCode).toBe(202);
      const { status, request_id } = res.json<{
        status: string;
        request_id: string;
      }>();
      expect(status).toBe('accepted');

      await until(() => post.mock.calls.length > 0);
      expect(post.mock.calls[0][0]).toBe(CALLBACK_URL);
      expect(post.mock.calls[0][1]).toEqual({
        request_id,
        status: 'completed',
        cloud: 'Позиция 1: арка',
        orderItems: ORDER_ITEMS,
      });
      expect(recognition.recognize.mock.calls[0][0]).toMatchObject({
        kind: 'document',
        extension: '.pdf',
      });
    });

    it('recognizes images as photos', async () => {
      await submit('photo.webp');
      await until(() => recognition.recognize.mock.calls.length > 0);
      expect(recognition.recognize.mock.calls[0][0]).toMatchObject({
        kind: 'photo',
      });
    });

    it('detects the format by content type when the name has no extension', async () => {
      const boundary = 'b';
      const payload =
        `--${boundary}\r\nContent-Disposition: form-data; name="callback_url"\r\n\r\n${CALLBACK_URL}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="blob"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\ndata\r\n` +
        `--${boundary}--\r\n`;
      const res = await app.inject({
        method: 'POST',
        url: RECOGNITIONS,
        headers: {
          ...AUTH,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(202);
      await until(() => recognition.recognize.mock.calls.length > 0);
      expect(recognition.recognize.mock.calls[0][0]).toMatchObject({
        kind: 'document',
        extension: '.docx',
      });
    });

    it('rejects an unsupported format', async () => {
      const res = await submit('order.txt');
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        code: 'unsupported_format',
        message:
          'Формат не поддерживается. Нужен PDF, DOC, DOCX, JPG, PNG или WEBP.',
      });
    });

    it('reports a recognition failure to the callback', async () => {
      recognition.recognize.mockRejectedValue(
        new RecognitionError('нет блоков'),
      );
      await submit();
      await until(() => post.mock.calls.length > 0);
      expect(post.mock.calls[0][1]).toMatchObject({
        status: 'error',
        error_type: 'pipeline_error',
        message: 'Не удалось распознать заявку: нет блоков.',
      });
    });

    it('treats a file read failure as an internal error', async () => {
      recognition.recognize.mockRejectedValue(new Error('битый PDF'));
      await submit();
      await until(() => post.mock.calls.length > 0);
      expect(post.mock.calls[0][1]).toMatchObject({
        status: 'error',
        error_type: 'internal_error',
        message: 'Не удалось обработать заявку.',
      });
    });

    it('returns 400 for a non-multipart request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: RECOGNITIONS,
        headers: AUTH,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'multipart_required' });
    });

    it('validates callback_url', async () => {
      const res = await submit('order.pdf', { callback_url: 'ftp://x' });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'invalid_callback_url' });
    });
  });

  describe('prompts page', () => {
    const PAGE = `${API}/admin/prompts`;
    const auth = (password = 'admin-password-123') => ({
      authorization: `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`,
    });
    const form = () => ({
      ...auth(),
      'content-type': 'application/x-www-form-urlencoded',
    });

    it('asks for a password', async () => {
      const res = await app.inject({ url: PAGE });
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toContain('Basic');

      const wrong = await app.inject({ url: PAGE, headers: auth('nope') });
      expect(wrong.statusCode).toBe(401);
    });

    it('shows the current prompts from files', async () => {
      const res = await app.inject({ url: PAGE, headers: auth() });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Фото рукописных бланков');
      expect(res.body).toContain('Документы PDF, DOC, DOCX');
      expect(res.body).toContain('из файла');
    });

    it('saves a prompt and resets it to the file', async () => {
      const saved = await app.inject({
        method: 'POST',
        url: `${PAGE}/photo`,
        headers: form(),
        payload: `text=${encodeURIComponent('Новый <промпт>')}`,
      });
      expect(saved.statusCode).toBe(303);
      expect(saved.headers.location).toBe(`${PAGE}?saved=photo`);
      expect(prisma.prompts.get('photo')?.text).toBe('Новый <промпт>');

      const page = await app.inject({
        url: `${PAGE}?saved=photo`,
        headers: auth(),
      });
      expect(page.body).toContain('Новый &lt;промпт&gt;');
      expect(page.body).toContain('промпт сохранён');
      expect(page.body).toContain('изменён');

      const reset = await app.inject({
        method: 'POST',
        url: `${PAGE}/photo/reset`,
        headers: auth(),
      });
      expect(reset.statusCode).toBe(303);
      expect(prisma.prompts.has('photo')).toBe(false);
    });

    it('rejects an empty prompt and an unknown key', async () => {
      const empty = await app.inject({
        method: 'POST',
        url: `${PAGE}/photo`,
        headers: form(),
        payload: 'text=%20',
      });
      expect(empty.statusCode).toBe(400);

      const unknown = await app.inject({
        method: 'POST',
        url: `${PAGE}/other`,
        headers: form(),
        payload: 'text=x',
      });
      expect(unknown.statusCode).toBe(400);
    });
  });
});
