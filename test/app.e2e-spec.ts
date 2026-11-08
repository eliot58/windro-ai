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
const RESULT = { orderItems: ORDER_ITEMS, addOrderitems: [] };

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

    it('returns 404 for an unknown frontend request', async () => {
      const res = await receive({ sellerCode: 'nope', status: 'success' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('API key', () => {
    const upload = () =>
      multipart({ callbackUrl: CALLBACK_URL }, { name: 'a.pdf', content: 'x' });

    it('rejects an order request without a key', async () => {
      const url = `${API}/orders/recognize/document`;
      const { headers, payload } = upload();
      const res = await app.inject({
        method: 'POST',
        url,
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
        url: `${API}/orders/some-id`,
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

  describe('frontend API', () => {
    const submit = (url: string, name = 'order.pdf', callback = CALLBACK_URL) =>
      app.inject({
        method: 'POST',
        url,
        ...multipart(
          { callbackUrl: callback, sellerCode: '1111-2222' },
          { name, content: 'data' },
        ),
      });

    it('sends recognized items to the callback without a proposal', async () => {
      const res = await submit(`${API}/orders/recognize/document`);
      expect(res.statusCode).toBe(202);
      expect(Object.keys(res.json<object>())).toEqual(['requestId']);

      await until(() => post.mock.calls.length > 0);
      expect(post.mock.calls[0][0]).toBe(CALLBACK_URL);
      expect(post.mock.calls[0][1]).toMatchObject({
        status: 'completed',
        orderItems: ORDER_ITEMS,
      });
      expect(proposalServer.send).not.toHaveBeenCalled();
    });

    it('waits for the PDF and forwards it to the callback', async () => {
      const res = await submit(`${API}/orders/proposal/document`);
      const { requestId } = res.json<{ requestId: string }>();
      await until(() => proposalServer.send.mock.calls.length > 0);

      const status = await app.inject({
        url: `${API}/orders/${requestId}`,
        headers: AUTH,
      });
      expect(status.json()).toMatchObject({
        status: 'processing',
        hasOrderItems: true,
      });

      await app.inject({
        method: 'POST',
        url: `${API}/proposals/webhook`,
        ...multipart(
          { sellerCode: '1111-2222', status: 'success' },
          { name: 'kp.pdf', content: '%PDF' },
        ),
      });
      await until(() => post.mock.calls.length > 0);
      const form = post.mock.calls[0][1] as unknown as FormData;
      expect(form.get('status')).toBe('completed');
      expect(form.get('file')).toBeInstanceOf(Blob);

      const done = await app.inject({
        url: `${API}/orders/${requestId}`,
        headers: AUTH,
      });
      expect(done.statusCode).toBe(404);
      expect(done.json()).toMatchObject({ code: 'request_not_found' });
    });

    it('reports a proposal server error to the callback', async () => {
      proposalServer.send.mockResolvedValue({
        status: 'failed',
        reason: 'down',
      });
      await submit(`${API}/orders/proposal/document`);
      await until(() => post.mock.calls.length > 0);
      expect(post.mock.calls[0][1]).toMatchObject({
        status: 'error',
        errorType: 'kp_server_error',
      });
    });

    it('reports a recognition failure to the callback', async () => {
      recognition.recognize.mockRejectedValue(
        new RecognitionError('нет блоков'),
      );
      await submit(`${API}/orders/recognize/document`);
      await until(() => post.mock.calls.length > 0);
      expect(post.mock.calls[0][1]).toMatchObject({
        errorType: 'pipeline_error',
        message: 'Не удалось распознать заявку: нет блоков.',
      });
    });

    it('treats a file read failure as an internal error', async () => {
      recognition.recognize.mockRejectedValue(new Error('битый PDF'));
      await submit(`${API}/orders/recognize/document`);
      await until(() => post.mock.calls.length > 0);
      expect(post.mock.calls[0][1]).toMatchObject({
        errorType: 'internal_error',
        message: 'Не удалось обработать заявку.',
      });
    });

    it('accepts only images for a photo proposal', async () => {
      const bad = await submit(`${API}/orders/proposal/photo`, 'order.pdf');
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toEqual({
        code: 'unsupported_format',
        message: 'Формат не поддерживается. Нужно фото JPG, PNG, BMP или WEBP.',
      });

      await submit(`${API}/orders/proposal/photo`, 'photo.png');
      await until(() => recognition.recognize.mock.calls.length > 0);
      expect(recognition.recognize.mock.calls[0][0]).toMatchObject({
        kind: 'photo',
      });
    });

    it('returns 400 for a non-multipart request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `${API}/orders/recognize/document`,
        headers: AUTH,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'multipart_required' });
    });

    it('validates callbackUrl', async () => {
      const res = await submit(
        `${API}/orders/recognize/document`,
        'order.pdf',
        'ftp://x',
      );
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'invalid_callback_url' });
    });
  });
});
