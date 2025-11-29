// IntentRouter - routes classified intents to handlers
import { IntentCategory, ClassifiedIntent } from './intent-classifier';

export type IntentHandler = (intent: ClassifiedIntent, context: any) => Promise<any>;

export class IntentRouter {
  private handlers: Map<IntentCategory, IntentHandler> = new Map();

  register(category: IntentCategory, handler: IntentHandler) {
    this.handlers.set(category, handler);
  }

  async route(intent: ClassifiedIntent, context: any): Promise<any> {
    const handler = this.handlers.get(intent.primary);
    if (!handler) throw new Error(`No handler for intent: ${intent.primary}`);
    return handler(intent, context);
  }
}
