const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const PORT = process.env.PORT || 8000;

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use(
  cors({
    origin: "*", // Expo dev client URLs
    credentials: true,
  })
);

const uri = `mongodb+srv://${process.env.DATABASE_USERNAME}:${process.env.DATABASE_PASSWORD}@cluster0.be4xnde.mongodb.net/coffeeShop?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// async function  connectDb() {
//   try {
//     await client.connect()
//     console.log('db connected')
//   } catch (error) {
//     console.log(error)
//   }
// }

// connectDb();

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

let db;

async function run() {
  try {
    await client.connect();
    db = client.db("coffeeShop");
    let usersCollection = db.collection("users");
    let dataCollection = db.collection("data");
    let favoriteCollection = db.collection("favorite");

    console.log("Successfully connected to MongoDB!");

    app.post("/register", async (req, res) => {
      const { email, password, name } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Check if user already exists
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        return res.status(409).json({ message: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = {
        name,
        email,
        image: "",
        password: hashedPassword,
        createdAt: new Date(),
      };

      const result = await usersCollection.insertOne(user);

      // Create JWT token
      const token = jwt.sign(
        { id: result.insertedId, email },
        process.env.JWT_SECRET,
        {
          expiresIn: "7d",
        }
      );
      res
        .status(201)
        .json({ token, user: { id: result.insertedId, email, name, image } });
    });

    app.post("/login", async (req, res) => {
      try {
        const { email, password } = req.body;

        // Find user in database
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(401).json({ message: "Invalid credentials" });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
          return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
          { id: user._id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );

        res.status(200).json({ user, token });
      } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.get("/products", async (req, res) => {
      const searchText = req.query.search || "";
      let data;
      if (searchText !== "") {
        data = await dataCollection
          .find({ name: { $regex: searchText, $options: "i" } })
          .toArray();
      } else {
        data = await dataCollection.find().toArray();
      }
      res.send(data);
    });

    app.get("/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await dataCollection.findOne(query);
      res.send(result);
    });

    app.post("/favorite", async (req, res) => {
      const { productId, user } = req.body;

      try {
        const userFavorite = await favoriteCollection.findOne({ user });

        if (userFavorite) {
          const alreadyFavorited = userFavorite.productIds.includes(productId);

          if (alreadyFavorited) {
            const updated = await favoriteCollection.updateOne(
              { user },
              { $pull: { productIds: productId } }
            );
            return res.send({ status: "removed" });
          } else {
            // Add the productId
            const updated = await favoriteCollection.updateOne(
              { user },
              { $push: { productIds: productId } }
            );
            return res.send({ status: "added"});
          }
        } else {
          const result = await favoriteCollection.insertOne({
            user,
            productIds: [productId],
          });
          return res.send({status: "added"});
        }
      } catch (error) {
        console.error("Error toggling favorite:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    app.post("/isfavorite", async (req, res) => {
      const {user,productId} = req.body
      const result = await favoriteCollection.findOne({ user ,  productIds:productId });
      res.send({isFavorited: !!result});
    });

    await client.db("admin").command({ ping: 1 });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
