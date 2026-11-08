// Замер точности на эталонах: для каждого файла с парным .json запускает
// распознавание и сравнивает результат с эталоном.
//   npm run eval:golden -- test/golden/documents [--limit N]
// Каждый файл стоит реальных запросов к OpenRouter
import 'dotenv/config';
import 'reflect-metadata';

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, parse } from 'node:path';

import { HttpService } from '@nestjs/axios';
import axios from 'axios';

import { proxyOptions } from '../src/common/http.utils';
import llmConfig from '../src/config/llm.config';
import {
  LLM_BASE_URL,
  LLM_TIMEOUT_MS,
} from '../src/recognition/constants/llm.constants';
import { DocumentReader } from '../src/recognition/document-reader';
import { HandwrittenOpeningsService } from '../src/recognition/handwritten-openings.service';
import { LlmClient } from '../src/recognition/llm.client';
import { OpeningClassifierService } from '../src/recognition/opening-classifier.service';
import { RecognitionService } from '../src/recognition/recognition.service';

const DOCUMENTS = ['.pdf', '.docx', '.doc'];
const IMAGES = ['.jpg', '.jpeg', '.png'];
const COORD_TOLERANCE_MM = 30;
const COORD_KEYS = new Set(['x', 'y']);
const OPENING_KEYS = new Set(['openType', 'openSide']);

type Json = Record<string, unknown>;

const isEmpty = (value: unknown) =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0);
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => String(value).trim().toLowerCase();

export function compare(
  expected: unknown,
  actual: unknown,
  path: string,
  key = '',
): string[] {
  if (expected === '????') return [];
  if (isEmpty(expected) && isEmpty(actual)) return [];

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return [
        `${path}: ожидалось ${expected.length}, получено ${actual.length}`,
      ];
    }
    return expected.flatMap((value, i) =>
      compare(value, actual[i], `${path}[${i}]`),
    );
  }
  if (isObject(expected) && isObject(actual)) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    return [...keys].flatMap((k) =>
      compare(expected[k], actual[k], `${path}.${k}`, k),
    );
  }
  if (
    COORD_KEYS.has(key) &&
    Math.abs(Number(expected) - Number(actual)) <= COORD_TOLERANCE_MM
  ) {
    return [];
  }
  return text(expected) === text(actual)
    ? []
    : [`${path}: ожидалось ${String(expected)}, получено ${String(actual)}`];
}

function loadExpected(path: string): Json[] {
  const data = JSON.parse(readFileSync(path, 'utf8')) as Json | Json[];
  return Array.isArray(data) ? data : ((data.orderItems as Json[]) ?? []);
}

async function main() {
  const [dir, ...rest] = process.argv.slice(2);
  if (!dir) throw new Error('Укажите папку с эталонами');
  const limitIndex = rest.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(rest[limitIndex + 1]) : Infinity;

  const config = llmConfig();
  const service = new RecognitionService(
    new DocumentReader(),
    new LlmClient(
      new HttpService(
        axios.create({
          baseURL: LLM_BASE_URL,
          timeout: LLM_TIMEOUT_MS,
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
          },
          ...proxyOptions(config.proxyUrl),
        }),
      ),
    ),
    new OpeningClassifierService(),
    new HandwrittenOpeningsService(),
    config,
  );

  const files = readdirSync(dir)
    .filter((name) =>
      [...DOCUMENTS, ...IMAGES].includes(extname(name).toLowerCase()),
    )
    .filter((name) => existsSync(join(dir, `${parse(name).name}.json`)))
    .slice(0, limit);

  let passed = 0;
  let openingErrors = 0;
  let structureErrors = 0;

  for (const name of files) {
    const extension = extname(name).toLowerCase();
    const file = readFileSync(join(dir, name));
    const orderItems: unknown[] = [];
    try {
      const result = await service.recognize(
        DOCUMENTS.includes(extension)
          ? { kind: 'document', extension, content: file }
          : { kind: 'photo', content: file },
      );
      orderItems.push(...result.orderItems);
    } catch (error) {
      console.log(`     ! ${String(error)}`);
    }

    const diffs = compare(
      loadExpected(join(dir, `${parse(name).name}.json`)),
      orderItems,
      'items',
    );
    const openings = diffs.filter((d) =>
      [...OPENING_KEYS].some((key) => d.includes(`.${key}:`)),
    );
    openingErrors += openings.length;
    structureErrors += diffs.length - openings.length;
    if (!diffs.length) passed++;

    console.log(`${diffs.length ? 'FAIL' : 'PASS'} ${name}`);
    for (const diff of diffs.slice(0, 15)) console.log(`     ${diff}`);
  }

  console.log(`\nСовпало файлов: ${passed} из ${files.length}`);
  console.log(`Ошибок открывания: ${openingErrors}`);
  console.log(`Прочих расхождений: ${structureErrors}`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
