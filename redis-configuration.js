const redis = require('redis');
const redisClient = redis.createClient({
    url: 'redis"//192.168.0.192:6379'
});

module.exports = redisClient;