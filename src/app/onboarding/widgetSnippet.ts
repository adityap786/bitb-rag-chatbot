// Widget embed code generator
export function getWidgetSnippet(tenantId: string, config: any): string {
  return `<script src=\"https://cdn.example.com/bitb-widget.js\"></script>\n<script>\n  BitBWidget.init({ tenant_id: \"${tenantId}\", colors: ${JSON.stringify(config.colors)}, tone: \"${config.tone}\" });\n<\/script>`;
}
