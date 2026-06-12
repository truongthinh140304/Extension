type StorageArea = chrome.storage.StorageArea;

const local = (): StorageArea => {
  if (!chrome?.storage?.local) {
    throw new Error('chrome.storage.local is not available in this context.');
  }

  return chrome.storage.local;
};

export async function getLocalValue<T>(key: string, fallback: T): Promise<T> {
  const value = await local().get(key);
  return (value[key] as T | undefined) ?? fallback;
}

export async function setLocalValue<T>(key: string, value: T): Promise<void> {
  await local().set({ [key]: value });
}

export async function removeLocalValue(key: string): Promise<void> {
  await local().remove(key);
}
