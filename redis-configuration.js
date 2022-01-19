const redis = require('redis');
const redisClient = redis.createClient({
    host: '192.168.0.192',
    port: 6379
});

module.exports = redisClient;