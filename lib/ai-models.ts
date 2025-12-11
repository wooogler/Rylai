// AI Model configurations for OpenRouter and other providers

export interface AIModel {
  id: string;
  name: string;
  provider: 'openrouter' | 'openai' | 'local';
  modelId: string; // The actual model ID to use with the API
  description?: string;
  contextWindow?: number;
  pricing?: {
    prompt: number;
    completion: number;
  };
}

export const AI_MODELS: AIModel[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openrouter',
    modelId: 'openai/gpt-4o',
    description: 'Latest GPT-4 Omni model',
    contextWindow: 128000,
  },
  {
    id: 'mistral-7b-instruct',
    name: 'Mistral 7B Instruct',
    provider: 'openrouter',
    modelId: 'mistralai/mistral-7b-instruct-v0.3',
    description: 'Mistral 7B Instruct model',
    contextWindow: 32768,
  },
  {
    id: 'grok-4.1-fast',
    name: 'Grok 4.1 Fast',
    provider: 'openrouter',
    modelId: 'x-ai/grok-4.1-fast',
    description: 'xAI Grok 4.1 Fast model',
    contextWindow: 131072,
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'openrouter',
    modelId: 'google/gemini-2.0-flash-001',
    description: 'Google Gemini 2.0 Flash',
    contextWindow: 1048576,
  },
  {
    id: 'deepseek-v3.2',
    name: 'DeepSeek V3.2',
    provider: 'openrouter',
    modelId: 'deepseek/deepseek-v3.2',
    description: 'DeepSeek V3.2 model',
    contextWindow: 65536,
  },
];

// Default model
export const DEFAULT_MODEL_ID = 'gpt-4o';

// Get model by ID
export function getModelById(id: string): AIModel | undefined {
  return AI_MODELS.find(model => model.id === id);
}

// Get OpenRouter API configuration
export function getOpenRouterConfig(apiKey: string) {
  return {
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: apiKey,
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'RYLAI - Cybergrooming Prevention Training',
    },
  };
}
