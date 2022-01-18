const minioClient = require('./minio-configuration');

const express = require('express');
const app = express();
const port = 8000;
const bodyParser = require('body-parser');
var Multer = require("multer");
var amqp = require('amqplib/callback_api');
const exec = require('util').promisify(require('child_process').exec);

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

app.post("/upload", Multer({storage: Multer.memoryStorage()}).single("upload"), function(request, response) {
        minioClient.putObject("cars", request.file.originalname, request.file.buffer, function (error, etag) {
            if (error) {
                return console.log(error);
            }
            console.log("[MINIO] File successfully uploaded!");
            response.send("[MINIO] File successfully uploaded!");
        });
        listRabbitMQ();
});

async function dowloadImage(){

}
async function getCarNumber(car_image){
    let result ="";
    try {

      const {stdout, stderr} = await exec (`alpr -c eu -p lv -j DOP704/image/${car_image}`);
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

function listRabbitMQ() {
    amqp.connect('amqp://192.168.0.192:5672', function(error0, connection) {
        if (error0) throw error0;
        connection.createChannel(function(error1, channel) {
            if (error1) {
                throw error1;
            }
                var queue = "car_in";
            channel.assertQueue(queue,{
                durable: true
            });
            console.log("[RabbitMQ] Waiting for messages in %s. To exit press CTRL+C", queue);
            channel.consume(queue, function(msg) {
                console.log("[RabbitMQ] Received %s", msg.content.toString());




            }, {
                noAck: true
            });
        });
    });
}