// Branding & tone config
export interface BrandingConfig {
  primary: string;
  accent: string;
  background: string;
  tone: 'Friendly' | 'Professional' | 'Playful' | 'Concise' | 'Empathetic';
}

export function getPromptTemplate(config: BrandingConfig): string {
  return `Respond in a ${config.tone} manner, using the brand colors ${config.primary}, ${config.accent}.`;
}
