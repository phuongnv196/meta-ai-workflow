const cache = new Map();

const memoryCache = {
    get: (key) => cache.get(key),
    set: (key, value) => cache.set(key, value),
    delete: (key) => cache.delete(key),
    has: (key) => cache.has(key),
    clear: () => cache.clear(),
    size: () => cache.size,
    keys: () => cache.keys(),
    values: () => cache.values(),
    entries: () => cache.entries()
};

module.exports = memoryCache;
