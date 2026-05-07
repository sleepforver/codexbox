export function renderPromptTemplate(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? '')
}

export function extractPromptVariables(content: string): string[] {
  return [...new Set([...content.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((match) => match[1]))]
}
