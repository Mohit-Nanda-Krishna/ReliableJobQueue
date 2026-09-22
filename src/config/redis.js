const { createClient } = require("redis");

const redisClient = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    socket: {
        reconnectStrategy: false
    }
});

redisClient.on("error", (err) => {
    console.error("Redis Client Error", err);
});

async function connectRedis() {
    if (!redisClient.isOpen) {
        await redisClient.connect();
        console.log("Connected to Redis");
    }
}

module.exports = {
    redisClient,
    connectRedis
};
