import { extname, parse } from 'node:path';

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { Api, Context, InputFile } from 'grammy';
import { firstValueFrom } from 'rxjs';

import {
  DOCUMENT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MAX_FILE_SIZE,
} from '../common/common.constants';
import { ProposalServerClient } from '../proposal-server/proposal-server.client';
import { RecognitionError } from '../recognition/recognition.error';
import { RecognitionService } from '../recognition/recognition.service';
import { RecognitionResult } from '../recognition/recognition.types';
import { UsersService } from '../users/users.service';
import { MIN_WINDOW_SIZE } from './telegram.constants';
import {
  badSizeMessage,
  FILE_TOO_LARGE_ERROR_MESSAGE,
  NOT_ACTIVATED_MESSAGE,
  notRecognizedMessage,
  PHOTO_HINT_MESSAGE,
  PROCESSING_ERROR_MESSAGE,
  PROCESSING_MESSAGE,
  PROPOSAL_ORDER_ERROR_MESSAGE,
  RESULT_CAPTION,
  UNSUPPORTED_FORMAT_MESSAGE,
} from './telegram.messages';
import { OrderJob } from './telegram.types';
import { findBadWindowSizes, replyTo } from './telegram.utils';

// Обработка занимает минуты, а Telegram ждёт ответ вебхука секунды.
// Поэтому обработчик отвечает сразу, а заказ считается в фоне
@Injectable()
export class TelegramOrderHandler {
  private readonly logger = new Logger(TelegramOrderHandler.name);

  constructor(
    private readonly http: HttpService,
    private readonly users: UsersService,
    private readonly recognition: RecognitionService,
    private readonly proposalServer: ProposalServerClient,
  ) {}

  async handleDocument(ctx: Context) {
    const document = ctx.message?.document;
    if (!document) return;

    const fileName = document.file_name ?? 'file';
    const extension = extname(fileName).toLowerCase();
    const isImage = IMAGE_EXTENSIONS.includes(extension);
    const sellerCode = await this.requireSellerCode(ctx);
    if (!sellerCode) return;

    if (!isImage && !DOCUMENT_EXTENSIONS.includes(extension)) {
      await ctx.reply(UNSUPPORTED_FORMAT_MESSAGE);
      return;
    }
    await this.start(ctx, {
      sellerCode,
      fileId: document.file_id,
      fileName,
      fileSize: document.file_size,
      fileType: isImage ? { kind: 'photo' } : { kind: 'document', extension },
    });
  }

  async handlePhoto(ctx: Context) {
    const photo = ctx.message?.photo?.at(-1);
    if (!photo) return;

    const sellerCode = await this.requireSellerCode(ctx);
    if (!sellerCode) return;

    await this.start(ctx, {
      sellerCode,
      fileId: photo.file_id,
      fileName: `photo_${ctx.from?.id}_${ctx.message?.message_id}.jpg`,
      fileSize: photo.file_size,
      fileType: { kind: 'photo' },
    });
  }

  private async requireSellerCode(ctx: Context): Promise<string | null> {
    const user = await this.users.find(ctx.from!.id);
    if (user?.isActive) return user.sellerCode;

    await replyTo(ctx, NOT_ACTIVATED_MESSAGE);
    return null;
  }

  private async start(
    ctx: Context,
    job: Omit<OrderJob, 'api' | 'chatId'> & { fileSize?: number },
  ) {
    if ((job.fileSize ?? 0) > MAX_FILE_SIZE) {
      await ctx.reply(FILE_TOO_LARGE_ERROR_MESSAGE);
      return;
    }
    await replyTo(ctx, PROCESSING_MESSAGE);

    const chatId = ctx.chat!.id;
    void this.process({ ...job, api: ctx.api, chatId }).catch(
      async (error: unknown) => {
        this.logger.error(`Ошибка обработки заказа: ${String(error)}`);
        await ctx.api
          .sendMessage(chatId, PROCESSING_ERROR_MESSAGE)
          .catch(() => undefined);
      },
    );
  }

  private async process(job: OrderJob) {
    const { api, chatId, fileType } = job;
    const content = await this.download(api, job.fileId);

    let result: RecognitionResult;
    try {
      result = await this.recognition.recognize({ ...fileType, content });
    } catch (error) {
      if (!(error instanceof RecognitionError)) throw error;
      const message = notRecognizedMessage(error.message);
      await api.sendMessage(
        chatId,
        fileType.kind === 'photo'
          ? `${message}\n\n${PHOTO_HINT_MESSAGE}`
          : message,
      );
      return;
    }

    const badSizes = findBadWindowSizes(result.orderItems);
    if (badSizes.length) {
      await api.sendMessage(chatId, badSizeMessage(badSizes, MIN_WINDOW_SIZE));
      return;
    }

    const proposal = await this.proposalServer.send(
      job.sellerCode,
      result.orderItems,
      result.addOrderitems,
    );
    await this.sendResult(job, result);
    if (proposal.status === 'failed') {
      await api.sendMessage(chatId, PROPOSAL_ORDER_ERROR_MESSAGE);
    }
  }

  private async sendResult(job: OrderJob, result: RecognitionResult) {
    const payload = {
      sellerCode: job.sellerCode,
      orderItems: result.orderItems,
      ...(result.addOrderitems.length && {
        addOrderitems: result.addOrderitems,
      }),
    };
    await job.api.sendDocument(
      job.chatId,
      new InputFile(
        Buffer.from(JSON.stringify(payload, null, 2)),
        `${parse(job.fileName).name}_result.txt`,
      ),
      { caption: RESULT_CAPTION },
    );
  }

  private async download(api: Api, fileId: string): Promise<Buffer> {
    const { file_path: filePath } = await api.getFile(fileId);
    const { data } = await firstValueFrom(
      this.http.get<ArrayBuffer>(`/${filePath}`),
    );
    return Buffer.from(data);
  }
}
