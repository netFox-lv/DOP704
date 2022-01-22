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
const nodemailer = require("nodemailer");


const { MongoClient } = require("mongodb");
const uri ="mongodb://admin:admin@192.168.0.198:27017";
// Create a new MongoClient
const client = new MongoClient(uri);


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
    amqp.connect('amqp://192.168.0.198:5672', function(error0, connection) {
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
    amqp.connect('amqp://192.168.0.198:5672', function(error0, connection) {
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

    try {

      await client.connect();
      const db = client.db('parking');
      const collection = db.collection('drive_in');

      let query = {
          car_plate : plate_number
      }

      let result = await collection.findOne(query);
      if (result == null) {
          query = {
              car_plate: plate_number,
              time_in: moment().format('DD.MM.YYYY HH:mm:ss'),
              time_out: ''
          }
           result = await collection.insertOne(query);
           console.log(`[MongoDB] Row was inserted -  ${result.insertedId}`);
      } else {
            const filter = {
                car_plate: plate_number
            }
            query = {
                $set: {
                    time_out: moment().format('DD.MM.YYYY HH:mm:ss')
                },
            }
            result = await collection.updateOne(filter,query);
            console.log(`[MongoDB] ${result.matchedCount} document(s) matched the filter, updated ${result.modifiedCount} document(s)`);

            const time_result = await collection.findOne({car_plate: plate_number})
                if (time_result) {
                    var startDate = moment(time_result.time_in, 'DD.MM.YYYY HH:mm:ss');
                    var endDate = moment(time_result.time_out, 'DD.MM.YYYY HH:mm:ss');
                    var secondsDiff = endDate.diff(startDate, 'minutes')
                }
                console.log(secondsDiff);
          let testAccount = await nodemailer.createTestAccount();
            let transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false, // true for 465, false for other ports
                auth: {
                   user: testAccount.user,
                   pass: testAccount.pass,
              },
          });
          let info = await transporter.sendMail({
              from: '"Auto Parking" <info@parkinglv.com>', // sender address
              to: "dop704test@gmail.com", // list of receivers
              subject: "Parking Latvia ✔", // Subject line
              text: `Your car - ${plate_number}. Spended time - ${result}`, // plain text body

          });
      }

    } catch (e) {
        console.log("[MongoDB] Error:\n" + e);
    } finally {
        await client.close();
    }

}