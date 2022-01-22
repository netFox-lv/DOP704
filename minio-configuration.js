var Minio = require('minio')
var minioClient = new Minio.Client({
    endPoint: '192.168.0.198',
    port: 9000,
    useSSL: false,
    accessKey: 'minioadmin',
    secretKey: 'minioadmin'
});

module.exports = minioClient;