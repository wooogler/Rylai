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
  // OpenAI Models (via OpenRouter or direct)
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openrouter',
    modelId: 'openai/gpt-4o',
    description: 'Latest GPT-4 Omni model',
    contextWindow: 128000,
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openrouter',
    modelId: 'openai/gpt-4-turbo',
    description: 'GPT-4 Turbo with vision',
    contextWindow: 128000,
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openrouter',
    modelId: 'openai/gpt-3.5-turbo',
    description: 'Fast and cost-effective',
    contextWindow: 16385,
  },

  // Anthropic Models (via OpenRouter)
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'openrouter',
    modelId: 'anthropic/claude-3.5-sonnet',
    description: 'Latest Claude Sonnet',
    contextWindow: 200000,
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'openrouter',
    modelId: 'anthropic/claude-3-opus',
    description: 'Most capable Claude model',
    contextWindow: 200000,
  },
  {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'openrouter',
    modelId: 'anthropic/claude-3-haiku',
    description: 'Fast and efficient',
    contextWindow: 200000,
  },

  // Google Models (via OpenRouter)
  {
    id: 'gemini-pro-1.5',
    name: 'Gemini 1.5 Pro',
    provider: 'openrouter',
    modelId: 'google/gemini-pro-1.5',
    description: 'Google\'s latest model',
    contextWindow: 2000000,
  },
  {
    id: 'gemini-flash-1.5',
    name: 'Gemini 1.5 Flash',
    provider: 'openrouter',
    modelId: 'google/gemini-flash-1.5',
    description: 'Fast and efficient',
    contextWindow: 1000000,
  },

  // Meta Models (via OpenRouter)
  {
    id: 'llama-3.1-70b',
    name: 'Llama 3.1 70B',
    provider: 'openrouter',
    modelId: 'meta-llama/llama-3.1-70b-instruct',
    description: 'Meta\'s powerful open model',
    contextWindow: 131072,
  },
  {
    id: 'llama-3.1-8b',
    name: 'Llama 3.1 8B',
    provider: 'openrouter',
    modelId: 'meta-llama/llama-3.1-8b-instruct',
    description: 'Smaller, faster Llama',
    contextWindow: 131072,
  },

  // Mistral Models (via OpenRouter)
  {
    id: 'mistral-large',
    name: 'Mistral Large',
    provider: 'openrouter',
    modelId: 'mistralai/mistral-large',
    description: 'Mistral\'s flagship model',
    contextWindow: 128000,
  },
  {
    id: 'mistral-medium',
    name: 'Mistral Medium',
    provider: 'openrouter',
    modelId: 'mistralai/mistral-medium',
    description: 'Balanced performance',
    contextWindow: 32000,
  },

  // Local Model Option
  {
    id: 'local-mistral-7b',
    name: 'Local Mistral 7B',
    provider: 'local',
    modelId: 'mistral-7b-instruct-v0.3',
    description: 'Self-hosted local model',
    contextWindow: 8192,
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
