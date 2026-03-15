import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { configService, PublicConfig } from '@/services/config';
import { VALIDATION_REGEX, VALIDATION_RULES } from '@/constants';

interface ConfigContextType {
  config: PublicConfig | null;
  isLoading: boolean;
  error: Error | null;
  refreshConfig: () => Promise<void>;
  getConfigValue: <K extends keyof PublicConfig>(key: K) => PublicConfig[K] | undefined;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedConfig = await configService.getPublicConfig();
      setConfig(fetchedConfig);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load config'));
      setConfig(configService.getDefaultConfig());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const refreshConfig = useCallback(async () => {
    configService.clearCache();
    await loadConfig();
  }, [loadConfig]);

  const getConfigValue = useCallback(<K extends keyof PublicConfig>(key: K): PublicConfig[K] | undefined => {
    if (config) {
      return config[key];
    }
    const defaults = configService.getDefaultConfig();
    return defaults[key];
  }, [config]);

  const value: ConfigContextType = {
    config,
    isLoading,
    error,
    refreshConfig,
    getConfigValue,
  };

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextType {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}

export function useConfigValue<K extends keyof PublicConfig>(key: K): PublicConfig[K] | undefined {
  const { config } = useConfig();
  if (config) {
    return config[key];
  }
  return configService.getDefaultConfig()[key];
}

export function useValidationRules() {
  const R = VALIDATION_RULES;
  
  return {
    PASSWORD_MIN_LENGTH: R.PASSWORD.MIN_LENGTH,
    PASSWORD_MAX_LENGTH: R.PASSWORD.MAX_LENGTH,
    USERNAME_MIN_LENGTH: R.USERNAME.MIN_LENGTH,
    USERNAME_MAX_LENGTH: R.USERNAME.MAX_LENGTH,
    EMAIL_MAX_LENGTH: R.EMAIL.MAX_LENGTH,
    SEARCH_KEYWORD_MIN_LENGTH: R.KEYWORD.MIN_LENGTH,
    SEARCH_KEYWORD_MAX_LENGTH: R.KEYWORD.MAX_LENGTH,
    VERIFICATION_CODE_LENGTH: R.VERIFICATION_CODE.LENGTH,
    USERNAME_REGEX: VALIDATION_REGEX.USERNAME,
    EMAIL_REGEX: VALIDATION_REGEX.EMAIL,
    MAX_TAGS_PER_USER: R.TAG.MAX_COUNT_PER_SOURCE,
  };
}

export function useAppInfo() {
  const { config } = useConfig();
  const defaults = configService.getDefaultConfig();
  
  return {
    NAME: config?.siteName ?? defaults.siteName,
    DESCRIPTION: config?.siteDescription ?? defaults.siteDescription,
    VERSION: config?.appVersion ?? defaults.appVersion,
  };
}

export function useFeatureFlags() {
  const { config } = useConfig();
  const defaults = configService.getDefaultConfig();
  
  return {
    enableRegistration: config?.allowRegistration ?? defaults.allowRegistration,
    communityEnabled: config?.communityEnabled ?? defaults.communityEnabled,
  };
}

export function useUserLimits() {
  const R = VALIDATION_RULES;
  
  return {
    maxSearchHistory: R.SEARCH_HISTORY.MAX_COUNT,
    maxFavorites: R.FAVORITES.MAX_COUNT,
    maxTagsPerUser: R.TAG.MAX_COUNT_PER_SOURCE,
  };
}

export function useSearchConfig() {
  const R = VALIDATION_RULES;
  
  return {
    searchDebounceMs: 300,
    suggestionsMaxLimit: R.SUGGESTIONS.MAX_LIMIT,
  };
}

export function usePaginationConfig() {
  const R = VALIDATION_RULES.PAGINATION;
  
  return {
    defaultPageSize: R.DEFAULT_PAGE_SIZE,
    maxPageSize: R.MAX_PAGE_SIZE,
    maxLogPageSize: R.MAX_LOG_PAGE_SIZE,
    defaultHistoryLimit: R.DEFAULT_HISTORY_LIMIT,
    maxHistoryLimit: R.MAX_HISTORY_LIMIT,
  };
}

export function useTrendingConfig() {
  const R = VALIDATION_RULES.TRENDING;
  
  return {
    defaultHours: R.DEFAULT_HOURS,
    maxHours: R.MAX_HOURS,
    defaultLimit: R.DEFAULT_LIMIT,
    maxLimit: R.MAX_LIMIT,
  };
}
