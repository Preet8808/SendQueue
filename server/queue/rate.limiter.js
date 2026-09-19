/**
 * Token Bucket Rate Limiter
 * Regulates dispatch frequency to strictly honor provider limits and warming schedules.
 */
class TokenBucketRateLimiter {
  constructor(ratePerSecond = 5, burstCapacity = 10) {
    this.ratePerSecond = Math.max(0.1, ratePerSecond);
    this.capacity = Math.max(1, burstCapacity);
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  setRate(ratePerSecond) {
    this.ratePerSecond = Math.max(0.1, ratePerSecond);
  }

  refill() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.ratePerSecond);
    this.lastRefill = now;
  }

  /**
   * Waits asynchronously until a token is available and consumes it.
   */
  async acquireToken() {
    while (true) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return true;
      }

      // Calculate how long to wait until 1 token is replenished
      const neededTokens = 1 - this.tokens;
      const waitMs = Math.ceil((neededTokens / this.ratePerSecond) * 1000);
      await new Promise(resolve => setTimeout(resolve, Math.max(20, waitMs)));
    }
  }
}

module.exports = TokenBucketRateLimiter;
