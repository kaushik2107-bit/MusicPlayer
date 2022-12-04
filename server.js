require('dotenv').config()
const axios = require('axios')
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const { Readable } = require("stream")
const app = express()
const router = express.Router()
const PORT = process.env.PORT
app.use(express.json())
app.use(cors())

const mongodb = require("mongodb")
const MongoClient = require('mongodb').MongoClient
const ObjectID = require('mongodb').ObjectID

// connecting to the database
let db
let db2
MongoClient.connect(process.env.DB || process.env['MONGODB_URI'], {useUnifiedTopology: true, useNewUrlParser: true}, (err, client) => {
  if (err) {
    console.log(err)
    process.exit(1)
  }

  db = client.db('musicplayer')
  db2 = client.db('userInfo')
  console.log("Database Connected Successfully")
})


// post route of  a song
app.post('/tracks', (req, res) => {

  const storage = multer.memoryStorage()
  const upload = multer({
    storage: storage,
  }).fields([
    {
      name: 'track',
      maxCount: 1
    },
    {
      name: 'image',
      maxCount: 1
    }
  ])
  upload(req, res, (err) => {
    console.log(req.files['track'][0])
    // return res.status(202).send({message: 'ok'})
    if (err) {
      return res.status(400).send({message: "Upload Failed", err: err})
    } else if (!req.body.name) {
      return res.status(400).send({message: "No track name found in body"})
    }

    let trackName = req.body.name

    const readableTrackStream = new Readable()
    readableTrackStream.push(req.files['track'][0].buffer)
    readableTrackStream.push(null)

    const readableImageStream = new Readable()
    readableImageStream.push(req.files['image'][0].buffer)
    readableImageStream.push(null)

    // console.log(readableImageStream)

    let bucket = new mongodb.GridFSBucket(db, {
      bucketName: 'tracks'
    })

    let bucket2 = new mongodb.GridFSBucket(db, {
      bucketName: 'image'
    })

    let uploadStream = bucket.openUploadStream(trackName)
    let uploadImg = bucket2.openUploadStream(trackName)
    let id = uploadStream.id
    // let id = uploadImg.id
    readableTrackStream.pipe(uploadStream)
    readableImageStream.pipe(uploadImg)


    uploadStream.on('error', () => {
      return res.status(500).send({message: "Error uploading file"})
    })

    uploadStream.on('finish', () => {
      return res.status(201).send({message: "File uploaded successfully"})
    })

  })
})

// get objectId from filename string

const url = "https://music-player-c3g1.onrender.com/"
app.get('/api/:fileName', async (req, res) => {
  try {
    let fileName = req.params.fileName

    if (!fileName) {
      return res.status(400).send({message: "File name not specified"})
    }

    const result = await db.collection('image.files').find({ filename: { $regex: fileName, $options: 'i' } }).toArray()
    if (!result.length) {
      return res.status(404).send({message: "No such file found"})
    }

    let image_ids = []
    let file_name = []
    result.map((item) => {
      image_ids.push(url + "images/" + item._id.toString())
    })

    result.map((item) => {
      file_name.push(item.filename)
    })

    const result2 = await db.collection('tracks.files').find({ filename: { $regex: fileName, $options: 'i' } }).toArray()
    if (!result2.length) {
      return res.status(404).send({message: "No such file found"})
    }

    let track_ids = []
    result2.map((item) => {
      track_ids.push(url + "tracks/" + item._id.toString())
    })

    // console.log(image_id, track_id)

    return res.status(200).send({message: "Successfully Done", image_id: image_ids, track_id: track_ids, file_name: file_name})
  } catch (err) {
    console.log(err)
    return res.status(500).send({message: "Internal Server Error"})
  }
})

app.get('/latest', async(req, res) => {
  try {
    const result = await db.collection('image.files').find().limit(5).toArray()
    const result2 = await db.collection('tracks.files').find().limit(5).toArray()

    let image_ids = []
    let file_name = []
    result.map((item) => {
      image_ids.push(url + "images/" + item._id.toString())
    })

    result.map((item) => {
      file_name.push(item.filename)
    })

    let track_ids = []
    result2.map((item) => {
      track_ids.push(url + "tracks/" + item._id.toString())
    })

    return res.status(200).send({message: "Successfully Done", image_id: image_ids, track_id: track_ids, file_name: file_name})
  } catch (err) {
    return res.status(500).send({message: "Internal Server Error"})
  }
})

// get route of a song
app.get('/tracks/:trackID', (req, res) => {
  try {
    var trackID = new ObjectID(req.params.trackID)
  } catch (err) {
    return res.status(400).send({message: "Invalid trackID in URL parameter."})
  }

  res.set('content-type', 'audio/mp3')
  res.set('accept-ranges', 'bytes')

  let bucket = new mongodb.GridFSBucket(db, {
    bucketName: 'tracks'
  })

  let downloadStream = bucket.openDownloadStream(trackID)

  downloadStream.on('data', (chunk) => {
    res.write(chunk)
  })

  downloadStream.on('error', () => {
    res.sendStatus(404)
  })

  downloadStream.on('end', () => {
    res.end()
  })
})

// get route of image
app.get('/images/:trackID', (req, res) => {
  try {
    var trackID = new ObjectID(req.params.trackID)
  } catch (err) {
    return res.status(400).send({message: "Invalid trackID in URL parameter."})
  }

  res.set('content-type', 'image/png')
  res.set('accept-ranges', 'bytes')

  let bucket = new mongodb.GridFSBucket(db, {
    bucketName: 'image'
  })

  let downloadStream = bucket.openDownloadStream(trackID)

  downloadStream.on('data', (chunk) => {
    res.write(chunk)
  })

  downloadStream.on('error', () => {
    res.sendStatus(404)
  })

  downloadStream.on('end', () => {
    res.end()
  })
})

// Check if user exist
app.post('/api/findUser', async (req, res) => {
  try {
    const result = await db2.collection('data').find({email: req.body.email}).toArray()
    console.log(result)
    if (result.length) {
      return res.status(202).send({message: "User found"})
    }
    return res.status(200).send({message: "User not found"})
  } catch (err) {
    console.log(err)
    return res.status(500).send({message: "Internal Server Error"})
  }
})


// User registration
app.post('/register', async (req, res) =>{
  try {
    const { email, name, profilePic } = req.body
    console.log(req.body)
    db2.collection('data').updateOne(
      {
        email: email
      },
      {
        $setOnInsert: {
          email: email,
          name: name,
          profilePic: profilePic,
          likedSongs: [],
          playlists: []
        }
      },
      {
        upsert: true
      }
    )

    res.status(201).send({message: "Ok"})

  } catch (err) {
    console.log(err)
    res.status(500).send({message: "Internal Server Error"})
  }
})


app.listen(PORT, () => console.log('Connected Successfully!', PORT))
