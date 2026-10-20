import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  APP_PAGE_PATH,
  builtInAiState,
  getAppPageUrl,
  openAppPage,
  prepareBuiltInAi,
  promptBuiltInAi,
} from './browser-api';

/** Languages the Prompt API of Chrome takes; any other one logs an error of the extension. */
const PROMPT_API_LANGUAGES = ['de', 'en', 'es', 'fr', 'ja'];

interface ModelOptions {
  expectedInputs: { languages: string[] }[];
  expectedOutputs: { languages: string[] }[];
}

describe('built-in AI', () => {
  const asked: ModelOptions[] = [];

  beforeEach(() => {
    asked.length = 0;
    vi.stubGlobal('LanguageModel', {
      availability: (options: ModelOptions) => {
        asked.push(options);
        return Promise.resolve('available');
      },
      create: (options: ModelOptions) => {
        asked.push(options);
        return Promise.resolve({ prompt: () => Promise.resolve('{}'), destroy: () => undefined });
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the model only about languages it supports', async () => {
    expect(await builtInAiState()).toBe('available');
    await prepareBuiltInAi();
    expect(await promptBuiltInAi('Вкладки: 1. Новости', {})).toBe('{}');

    expect(asked).toHaveLength(3);
    const languages = asked.flatMap((options) =>
      [...options.expectedInputs, ...options.expectedOutputs].flatMap((item) => item.languages),
    );
    expect(languages.every((language) => PROMPT_API_LANGUAGES.includes(language))).toBe(true);
  });

  it('is unavailable without the Prompt API or when Chrome refuses', async () => {
    vi.stubGlobal('LanguageModel', {
      availability: () => Promise.reject(new DOMException('No', 'NotSupportedError')),
    });
    expect(await builtInAiState()).toBe('unavailable');
    vi.stubGlobal('LanguageModel', undefined);
    expect(await builtInAiState()).toBe('unavailable');
  });
});

describe('browser-api', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('builds the main page URL inside the extension', () => {
    expect(getAppPageUrl().endsWith(APP_PAGE_PATH)).toBe(true);
  });

  it('opens the main page in a new tab', async () => {
    await openAppPage();

    const tabs = await browser.tabs.query({});
    expect(tabs.map((tab) => tab.url)).toContain(getAppPageUrl());
  });
});
