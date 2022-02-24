import nunjucks from 'nunjucks';
import { get } from 'svelte/store';
import { settingsStore } from '~/store';
import type { Article, RenderTemplate } from './models';

export class Renderer {
  constructor() {
    nunjucks.configure({ autoescape: false });
  }

  validate(template: string): boolean {
    try {
      nunjucks.renderString(template, {});
      return true;
    } catch (error) {
      return false;
    }
  }

  render(entry: Article, isNew = true): string {
    const { metadata , highlights, page_note } = entry;

    const annotationTimestamps = [...new Set(highlights.map(h => h.updated))].sort();

    const context: RenderTemplate = {
       ...metadata,
       highlights,
       page_note,
       annotation_dates: annotationTimestamps,
    };

    const template = get(settingsStore).template;
    const content = nunjucks.renderString(template, context);
    return content;
  }
}
