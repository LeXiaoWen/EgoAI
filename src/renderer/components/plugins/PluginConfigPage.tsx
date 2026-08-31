import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';

interface PluginConfigPageProps {
  pluginId: string;
  onBack: () => void;
  initialConfig?: Record<string, unknown>;
  onConfigChange: (pluginId: string, config: Record<string, unknown>) => void;
  onConfigLoaded: (pluginId: string, config: Record<string, unknown>) => void;
}

interface ConfigSchemaData {
  configSchema: Record<string, unknown>;
  uiHints: Record<string, {
    label?: string;
    help?: string;
    sensitive?: boolean;
    advanced?: boolean;
    placeholder?: string;
    order?: number;
  }>;
}

interface SchemaLeaf {
  path: string;
  type: string;
  default?: unknown;
  description?: string;
}

/** Collect leaf fields from a JSON schema (recursing into nested objects). */
function collectSchemaLeaves(
  schema: Record<string, unknown>,
  prefix = '',
  out: SchemaLeaf[] = [],
): SchemaLeaf[] {
  const properties = (schema.properties ?? schema) as Record<string, Record<string, unknown>> | undefined;
  if (!properties || typeof properties !== 'object') return out;
  for (const [key, prop] of Object.entries(properties)) {
    if (!prop || typeof prop !== 'object') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (prop.type === 'object' && prop.properties) {
      collectSchemaLeaves(prop as Record<string, unknown>, path, out);
    } else {
      out.push({
        path,
        type: typeof prop.type === 'string' ? prop.type : 'string',
        ...(typeof prop.default !== 'undefined' ? { default: prop.default } : {}),
        ...(typeof prop.description === 'string' ? { description: prop.description } : {}),
      });
    }
  }
  return out;
}

/** Read a value from a nested object by dot path. */
function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Deep-set a value in nested object by dot path, returning a new object */
function deepSet(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  const result = { ...obj };
  let current: Record<string, unknown> = result;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const existing = current[key];
    current[key] = existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];
  if (value === '' || value === undefined) {
    delete current[lastKey];
  } else {
    current[lastKey] = value;
  }

  return result;
}

export default function PluginConfigPage({ pluginId, onBack, initialConfig, onConfigChange, onConfigLoaded }: PluginConfigPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schema, setSchema] = useState<ConfigSchemaData | null>(null);
  const [configValue, setConfigValue] = useState<Record<string, unknown>>(initialConfig ?? {});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  // The parent echoes every local edit through initialConfig. Only its mount-time
  // presence decides whether the backend value should initialize this editor.
  const hasPendingConfigOnMountRef = useRef(initialConfig !== undefined);

  const loadSchema = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electron?.plugins.getConfigSchema(pluginId);
      if (result?.success && result.schema) {
        setSchema(result.schema);
        const loadedConfig = result.config ?? {};
        // If parent already has a pending config for this plugin, use that instead
        if (!hasPendingConfigOnMountRef.current) {
          setConfigValue(loadedConfig);
        }
        // Notify parent about the initial config from backend
        onConfigLoaded(pluginId, loadedConfig);
      } else {
        setError(result?.error || i18nService.t('pluginsConfigLoadError'));
      }
    } catch {
      setError(i18nService.t('pluginsConfigLoadError'));
    }
    setLoading(false);
  }, [pluginId, onConfigLoaded]);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  const handleChange = (path: string, value: unknown) => {
    const next = deepSet(configValue, path, value);
    setConfigValue(next);
    onConfigChange(pluginId, next);
  };

  const handleToggleSecret = (path: string) => {
    setShowSecrets(prev => ({ ...prev, [path]: !prev[path] }));
  };

  return (
    <div className="space-y-6 px-1">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-raised transition-colors"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {i18nService.t('pluginsConfigTitle')}
          </h3>
          <p className="text-sm text-muted-foreground">{pluginId}</p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
      ) : error ? (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-4">
          {error}
        </div>
      ) : !schema ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          {i18nService.t('pluginsConfigNoSchema')}
        </div>
      ) : (
        <div className="rounded-lg border border-border p-4">
          {(() => {
            const leafFields = schema ? collectSchemaLeaves(schema.configSchema) : [];
            return (
              <div className="space-y-4">
                {leafFields.map((field) => {
                  const hint = schema.uiHints[field.path];
                  const value = getValueAtPath(configValue, field.path);
                  const label = hint?.label ?? field.path;
                  const help = hint?.help ?? field.description;
                  const isSensitive = hint?.sensitive === true;
                  const revealed = showSecrets[field.path] === true;
                  if (field.type === 'boolean') {
                    return (
                      <label key={field.path} className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={value === true}
                          onChange={(e) => handleChange(field.path, e.target.checked)}
                          className="rounded border-border"
                        />
                        <span>{label}</span>
                        {help && <span className="text-xs text-muted-foreground">{help}</span>}
                      </label>
                    );
                  }
                  const inputType = isSensitive && !revealed
                    ? 'password'
                    : field.type === 'number' || field.type === 'integer'
                      ? 'number'
                      : 'text';
                  return (
                    <div key={field.path}>
                      <label className="mb-1 block text-xs font-medium text-foreground">{label}</label>
                      <div className="flex items-center gap-2">
                        <input
                          type={inputType}
                          value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
                          placeholder={hint?.placeholder}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (field.type === 'number' || field.type === 'integer') {
                              handleChange(field.path, raw === '' ? '' : Number(raw));
                            } else {
                              handleChange(field.path, raw);
                            }
                          }}
                          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
                        />
                        {isSensitive && (
                          <button
                            type="button"
                            onClick={() => handleToggleSecret(field.path)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {revealed ? i18nService.t('pluginsConfigHideSecret') : i18nService.t('pluginsConfigShowSecret')}
                          </button>
                        )}
                      </div>
                      {help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
