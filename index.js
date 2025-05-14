const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
var jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

const stripe = require("stripe")(process.env.STRIPE_SK);

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
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );

    const userCollection = client.db("Assignment12").collection("users");
    const campCollection = client.db("Assignment12").collection("camps");
    const requestCollection = client.db("Assignment12").collection("requests");
    const paymentCollection = client.db("Assignment12").collection("payments");
    const reviewCollection = client.db("Assignment12").collection("reviews");

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

    // request apis here
    app.post("/requests", verifyToken, async (req, res) => {
      const requestData = req.body;
      const campId = requestData.camp_id;
      const query = {
        participant_email: requestData?.participant_email,
        camp_id: campId,
      };

      const existingRequest = await requestCollection.findOne(query);
      if (existingRequest) {
        return res.status(400).send({
          success: false,
          message: "You have already applied for this campaign",
        });
      }
      const result = await requestCollection.insertOne(requestData);

      // updating participant count
      const filter = { _id: new ObjectId(requestData?.camp_id) };
      const updateDoc = {
        $inc: {
          participant_count: 1,
        },
      };
      const updateCount = await campCollection.updateOne(filter, updateDoc);

      res.send(result);
    });
    // get all requests
    app.get("/requests", verifyToken, verifyAdmin, async (req, res) => {
      const result = await requestCollection.find().toArray();
      res.send(result);
    });

    // get the requests by emails
    app.get("/requests/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { participant_email: email };
      const result = await requestCollection.find(query).toArray();
      res.send(result);
    });

    // camp apis here
    // post a camp
    app.post("/camps", verifyToken, verifyAdmin, async (req, res) => {
      const campData = req.body;
      const result = await campCollection.insertOne(campData);
      res.send(result);
    });
    // get all camps
    app.get("/camps", async (req, res) => {
      const search = req.query.search;
      let query = {};
      if(search){
        query={
          camp_name : {$regex : search, $options: "i"},
        }
      }
      const result = await campCollection.find(query).toArray();
      res.send(result);
    });
    // get a single camp data
    app.get("/camps/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await campCollection.findOne(query);
      res.send(result);
    });
    // update a camp data
    app.patch("/camps/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: { ...updateData },
      };
      const result = await campCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });
    // dele a camp
    app.delete("/camps/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await campCollection.deleteOne(query);
      res.send(result);
    });

    // payment intend
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // insert payment data
    app.post("/payment", verifyToken, async (req, res) => {
      const paymentData = req.body;
      const result = await paymentCollection.insertOne(paymentData);
      console.log(paymentData);
      const query = {
        camp_id: paymentData?.camp_id,
        participant_name: paymentData?.participant_name,
      };
      const updateDoc = {
        $set: {
          payment_status: "paid",
        },
      };
      const update = await requestCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // confirmation status confirm
    app.patch(
      "/request-confirm/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            confirmation_status: "confirmed",
          },
        };
        const result = await requestCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    // delete request by admin
    app.delete(
      "/request-delete/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const campId = req.query.campId;
        const deleteQuery = { _id: new ObjectId(id) };
        const result = await requestCollection.deleteOne(deleteQuery);
        const query = { _id: new ObjectId(campId) };
        const updateDoc = {
          $inc: {
            participant_count: -1,
          },
        };
        const update = await campCollection.updateOne(query, updateDoc);

        res.send(result);
      }
    );

    // delete request by user
    app.delete("/request-delete/user/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const campId = req.query.campId;
      const deleteQuery = { _id: new ObjectId(id) };
      const result = await requestCollection.deleteOne(deleteQuery);
      const query = { _id: new ObjectId(campId) };
      const updateDoc = {
        $inc: {
          participant_count: -1,
        },
      };
      const update = await campCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // ALL PAYMENT HISTORY APIS
    app.get("/payment-history/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const query = { participant_email: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });
    // storing all the reviews here
    app.post("/reviews", verifyToken, async (req, res) => {
      const reviewData = req.body;
      const campId = reviewData.camp_id;
      const query = { camp_id: campId, participant_email: reviewData?.email };
      const updateDoc = {
        $set: {
          review_status: "given",
        },
      };
      const update = await requestCollection.updateOne(query, updateDoc);

      const result = await reviewCollection.insertOne(reviewData);
      res.send(result);
    });

    // get all the user stats from here
    app.get("/user-stats/:email",verifyToken, async (req, res) => {
      const email = req.params.email;

      const totalRequests = await requestCollection.countDocuments({
        participant_email: email,
      });
      const totalPayments = await paymentCollection.countDocuments({
        participant_email: email,
      });
      const totalReviews = await reviewCollection.countDocuments({
        email: email,
      });

      res.send({ totalRequests, totalPayments, totalReviews });
    });

    // update user profile api
    app.patch("/update-user/:email",verifyToken, async (req, res) => {
      const email = req.params.email;
      const { name, photo, contact } = req.body;
      const query = {
        email: email,
      };
      try {
        const result = await userCollection.updateOne(query, {
          $set: {
            name: name,
            contact: contact
          },
        });
        res.send(result);
      } catch (error) {
        console.error("Update failed:", error);
        res.status(500).send({ error: "Profile update failed" });
      }
    });

    // top events 
    app.get("/top-events", async(req,res)=>{
      const result = await campCollection.find().sort({participant_count : -1}).limit(6).toArray();;
      res.send(result);
    })

    // review Collections 
    app.get("/reviews", async(req,res)=>{
      const result = await reviewCollection.find().toArray();
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
