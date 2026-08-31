export const EgoAIRequestCapability = {
  OptionsV1: 'egoai-options-v1',
} as const;

export type EgoAIRequestCapability =
  typeof EgoAIRequestCapability[keyof typeof EgoAIRequestCapability];

export const EGOAI_REQUEST_OPTIONS_FIELD = 'lobsterai_options';
export const EGOAI_REQUEST_OPTIONS_VERSION = 1;

const EGOAI_REQUEST_CAPABILITY_VALUES = new Set<string>(
  Object.values(EgoAIRequestCapability),
);

export const parseEgoAIRequestCapabilities = (
  value: unknown,
): EgoAIRequestCapability[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const result: EgoAIRequestCapability[] = [];
  const seen = new Set<EgoAIRequestCapability>();
  for (const candidate of value) {
    if (
      typeof candidate !== 'string'
      || !EGOAI_REQUEST_CAPABILITY_VALUES.has(candidate)
    ) {
      continue;
    }
    const capability = candidate as EgoAIRequestCapability;
    if (!seen.has(capability)) {
      seen.add(capability);
      result.push(capability);
    }
  }
  return result.length > 0 ? result : undefined;
};

export const supportsEgoAIRequestOptionsV1 = (
  capabilities: readonly EgoAIRequestCapability[] | undefined,
): boolean => capabilities?.includes(EgoAIRequestCapability.OptionsV1) === true;
