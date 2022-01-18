const minioClient = require('./minio-configuration');

const express = require('express');
const app = express();
const port = 3000;
const bodyParser = require('body-parser');
const path = require('path');
var Multer = require("multer");
var amqp = require('amqplib/callback_api');
const util = require('util');
const exec = util.promisify(require('child_process').exec)

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
});

async function getCarNumber(){
    let result ="";
    try {

        const {stdout,stderr} = await exec ('alpr -c eu -p lv -j h786poj.jpg');




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
    amqp.connect('amqp://127.0.0.1:5672', function(error0, connection) {
        if (error0) throw error0;
        connection.createChannel(function(error1, channel) {
            if (error1) {
                throw error1;
            }
                var queue = "car_in"

        });
    });
}

