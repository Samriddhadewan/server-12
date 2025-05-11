const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
var jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@phassignment.y94e1.mongodb.net/?retryWrites=true&w=majority&appName=phAssignment`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const userCollection = client.db("Assignment12").collection("users");
    const campCollection = client.db("Assignment12").collection("camps");

    // JWT RELATED APIS
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
        if (error) {
          return res.status(401).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // save all newly created users here
    app.post("/users", async (req, res) => {
      const userData = req.body;
      const query = { email: userData?.email };
      console.log(userData);

      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist", insertedId: null });
      }
      const result = await userCollection.insertOne(userData);
      res.send(result);
    });

    // checking the is user is admin or not
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // camp apis here
    // post a camp 
    app.post("/camps",verifyToken,verifyAdmin, async (req, res) => {
      const campData = req.body;
      const result = await campCollection.insertOne(campData);
      res.send(result);
    });
    // get all camps 
    app.get("/camps", verifyToken,verifyAdmin, async(req,res)=>{
      const result = await campCollection.find().toArray();
      res.send(result)
    })
    // get a single camp data 
    app.get("/camps/:id", async(req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await campCollection.findOne(query);
      res.send(result);
    })
    // update a camp data 
    app.patch("/camps/:id",verifyToken,verifyAdmin, async(req,res)=>{
      const id = req.params.id;
      const updateData = req.body;
      const query = {_id: new ObjectId(id)}
      const options = {upsert : true};
      const updateDoc = {
        $set:{...updateData}
      }
      const result = await campCollection.updateOne(query,updateDoc,options);
      res.send(result);
    })

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Assignment 12 / the final assignment of level 1");
});

app.listen(port, () => {
  console.log(`server is running in ${port}`);
});
