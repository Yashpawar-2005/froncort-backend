import { Queue } from "bullmq";
import IORedis from "ioredis";
const connection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const mailingqueue = new Queue("mailing", { connection });
export {mailingqueue}