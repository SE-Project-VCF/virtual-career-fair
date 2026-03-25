/**
 * patchCache.js
 * 
 * Temporary in-memory cache for tailoring session state.
 * Stores Gemini responses and user feedback temporarily.
 * 
 * In production, use Redis or Firestore with TTL.
 * For now, uses simple in-memory Map with cleanup.
 */

class PatchCache {
  constructor() {
    // Cache structure:
    // cache[`${uid}:${invitationId}`] = {
    //   patchResponse: { patches, skillSuggestions, ... },
    //   jobContext: { jobId, jobTitle, jobDescription, ... },
    //   createdAt: timestamp,
    //   expiresAt: timestamp
    // }
    this.cache = new Map();
    this.cleanupInterval = 3600000; // 1 hour
    this.ttl = 3600000; // 1 hour (3600 seconds * 1000ms)

    // Auto cleanup every hour
    if (process.env.NODE_ENV !== "test") {
      setInterval(() => this.cleanup(), this.cleanupInterval);
    }
  }

  /**
   * Store patch response with job context
   */
  setCacheEntry(uid, invitationId, patchResponse, jobContext) {
    const cacheKey = this.getCacheKey(uid, invitationId);
    const now = Date.now();

    this.cache.set(cacheKey, {
      patchResponse,
      jobContext,
      createdAt: now,
      expiresAt: now + this.ttl
    });

    return {
      cached: true,
      cacheKey,
      expiresAt: new Date(now + this.ttl).toISOString()
    };
  }

  /**
   * Retrieve cached patch response
   */
  getCacheEntry(uid, invitationId) {
    const cacheKey = this.getCacheKey(uid, invitationId);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return { cached: false, error: "Cache miss or expired" };
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey);
      return { cached: false, error: "Cache expired" };
    }

    return {
      cached: true,
      patchResponse: entry.patchResponse,
      jobContext: entry.jobContext,
      createdAt: new Date(entry.createdAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString()
    };
  }

  /**
   * Clear specific cache entry
   */
  clearCacheEntry(uid, invitationId) {
    const cacheKey = this.getCacheKey(uid, invitationId);
    return this.cache.delete(cacheKey);
  }

  /**
   * List all cache keys for a user (useful for debugging)
   */
  getUserCacheKeys(uid) {
    const prefix = `${uid}:`;
    return Array.from(this.cache.keys()).filter(key => key.startsWith(prefix));
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[PatchCache] Cleaned up ${cleanedCount} expired entries`);
    }
  }

  /**
   * Get cache stats (for monitoring)
   */
  getStats() {
    return {
      entriesCount: this.cache.size,
      memoryEstimate: `~${(this.cache.size * 5)} KB`, // rough estimate
      cacheKeys: Array.from(this.cache.keys()).map(key => ({
        key,
        createdAt: new Date(this.cache.get(key).createdAt).toISOString(),
        expiresAt: new Date(this.cache.get(key).expiresAt).toISOString()
      }))
    };
  }

  /**
   * Generate cache key
   */
  getCacheKey(uid, invitationId) {
    return `${uid}:${invitationId}`;
  }

  /**
   * Clear all cache (use cautiously, mainly for testing)
   */
  clearAll() {
    const count = this.cache.size;
    this.cache.clear();
    return { cleared: count };
  }
}

// Singleton instance
const patchCache = new PatchCache();

module.exports = patchCache;
