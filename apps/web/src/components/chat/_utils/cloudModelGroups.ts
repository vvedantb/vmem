interface CloudModelListItem {
  id: string;
  name: string;
}

export function providerFromOpenRouterModelId(id: string): string {
  const slashIndex = id.indexOf("/");
  if (slashIndex === -1) return "other";
  return id.slice(0, slashIndex);
}

export function formatOpenRouterProviderLabel(provider: string): string {
  return provider
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function groupCloudModelsByProvider<T extends CloudModelListItem>(
  models: readonly T[],
): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();

  for (const model of models) {
    const provider = providerFromOpenRouterModelId(model.id);
    const existing = groups.get(provider);
    if (existing) {
      existing.push(model);
    } else {
      groups.set(provider, [model]);
    }
  }

  for (const list of groups.values()) {
    list.sort((left, right) => left.name.localeCompare(right.name));
  }

  return [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}
