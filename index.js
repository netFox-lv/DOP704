const minioClient = require('./minio-configuration');


const express = require('express');
const app = express();
const port = 8000;
const bodyParser = require('body-parser');
const Multer = require("multer");
const amqp = require('amqplib/callback_api');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const moment = require('moment');

const redis = require('redis');
const redisClient = redis.createClient({
    url: 'redis://192.168.0.192:6379'
});




app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.listen(port, () => console.log(`[SERVER] App listening on port ${port}!`))

minioClient.makeBucket('cars', function (err) {
    if (err){
        if (err.code=="BucketAlreadyOwnedByYou") {
            return console.log("[MINIO] Bucket is created! \n[MINIO] Bucket: "+err.bucketname);
        }else {
            return console.log("[MINIO] Error is: "+err.code);
        }
    }
    console.log('[MINIO] Bucket created successfully')
});

app.post("/upload", Multer({storage: Multer.memoryStorage()}).single("upload"), async function (request, response) {
    await minioClient.putObject("cars", request.file.originalname, request.file.buffer, async function (error, etag) {
        if (error) {
            return console.log("[MINIO] Error:\n" + error);
        }
        await console.log("[MINIO] File successfully uploaded!");
        response.send("[MINIO] File successfully uploaded!");
    });
    await openChannel(request.file.originalname);
    await listRabbitMQ();
});

async function getCarNumber(car_image){
    let result ="";
    try {

      const {stdout, stderr} = await exec (`alpr -c eu -p lv -j /images/${car_image}`);

         let tesOut = JSON.parse(stdout.toString());
        if (tesOut.results.length >0){
            console.log("[OpenALPR] Result: "+tesOut.results[0].plate);
            result = tesOut.results[0].plate;
        }else{
            result ="[OpenALPR] Cannot Find any car number!"
        }

    } catch (e){
        console.log("[OpenALPR] Error:\n"+e)
    }
    if (result === "") {
        return "[OpenALPR] Not found a car number"
    } else {
        return result
    }
}

function openChannel(file_name){
    amqp.connect('amqp://192.168.0.192:5672', function(error0, connection) {
        if (error0) throw error0;
        connection.createChannel(function(error1, channel) {
            if (error1) {
                throw error1;
            }
            var queue = "car_drive_in";
            channel.assertQueue(queue, {
                durable: true
            });
            var msg = file_name;
            channel.sendToQueue(queue, Buffer.from (msg));
            console.log("[RabbitMQ] Sent %s", msg);
        });
    });
}

function listRabbitMQ() {
    amqp.connect('amqp://192.168.0.192:5672', function(error0, connection) {
        if (error0) throw error0;
        connection.createChannel(function(error1, channel) {
            if (error1) {
                throw error1;
            }

            var queue = "car_drive_in";
            channel.assertQueue(queue,{
                durable: true
            });
            console.log("[RabbitMQ] Waiting for messages in %s. To exit press CTRL+C", queue);
            channel.consume(queue, function(msg) {
                console.log("[RabbitMQ] Received %s", msg.content.toString());

                let car_image = msg.content.toString();

                minioClient.fGetObject('cars', car_image,'/images/'+car_image, async function (error, stream) {
                    if (error) {
                        return console.log("[MINIO] Error:\n" + error)
                    }
                    let finded_car_number = await getCarNumber(car_image);

                    await setCar(finded_car_number);

                });


            }, {
                noAck: true
            });
        });
    });
}

async function setCar(plate_number){

    if(!redisClient.isOpen) await function() {
        redisClient.on('error', err => {
            console.log('[REDIS] Error ' + err);
        });
    }
    let parking_list = await redisClient.hGetAll('parking');

    if(!parking_list || (!plate_number in parking_list)){
        console.log("here");
        await redisClient.hSet('parking',plate_number,moment.format('YYYY-MM-DD HH:MM:SS'));
        console.log("Plate Number:"+plate_number+"\nTime: "+moment.format('YYYY-MM-DD HH:MM:SS'));
            return {
                status: 'in parking'
            };
    }

}