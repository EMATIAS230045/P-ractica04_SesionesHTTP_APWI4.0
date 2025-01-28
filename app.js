import express from "express";
import bodyParser from "body-parser";
import sessions from "express-session";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import { MongoClient } from "mongodb";

// Cargar variables de entorno desde .env
dotenv.config();

const app = express();
const Port = 3000;

// Configuración de MongoDB
const mongoUri = process.env.MONGO_URI;
const dbName = "sesionesDB";
let sesionesCollection;

(async () => {
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);
  sesionesCollection = db.collection("sesiones");
  console.log("Conectado a MongoDB");
})();

// Middleware para procesar JSON y formularios
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware de sesiones
app.use(
  sessions({
    secret: process.env.SESSION_SECRET || "defaultSecret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 5 * 60 * 1000 }, // 5 minutos
  })
);

// Obtener información de la red del servidor
const getServerNetworkInfo = () => {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return { serverIp: iface.address, serverMac: iface.mac };
      }
    }
  }
};

// Obtener IP del cliente
const getClientIP = (req) => {
  return (
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket?.remoteAddress
  );
};

// Endpoint: Login
app.post("/login", async (req, res) => {
  const { email, nickname, macAddress } = req.body;

  if (!email || !nickname || !macAddress) {
    return res.status(400).json({ message: "Se esperan campos requeridos" });
  }

  const existingSession = await sesionesCollection.findOne({ email, nickname, status: "Activa" });

  if (existingSession) {
    const now = new Date();
    await sesionesCollection.updateOne(
      { sessionId: existingSession.sessionId },
      { $set: { lastAccessed: now, inactiveTime: 0 } }
    );

    return res.status(200).json({
      message: "Sesión reactivada",
      sessionId: existingSession.sessionId,
    });
  }

  const sessionId = uuidv4();
  const now = new Date();
  const serverInfo = getServerNetworkInfo();

  const newSession = {
    sessionId,
    email,
    nickname,
    macAddress,
    clientIp: getClientIP(req),
    serverIp: serverInfo.serverIp,
    serverMac: serverInfo.serverMac,
    createdAt: now,
    lastAccessed: now,
    inactiveTime: 0,
    status: "Activa",
  };

  await sesionesCollection.insertOne(newSession);

  res.status(200).json({
    message: "Sesión iniciada",
    sessionId,
  });
});

// Endpoint: Logout
app.post("/logout", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: "Se espera sessionId" });
  }

  const session = await sesionesCollection.findOne({ sessionId });

  if (!session) {
    return res.status(404).json({ message: "Sesión no encontrada" });
  }

  await sesionesCollection.updateOne(
    { sessionId },
    { $set: { status: "Finalizada" } }
  );

  res.status(200).json({ message: "Logout exitoso" });
});

// Endpoint: Update Session
app.put("/update", async (req, res) => {
  const { sessionId, email, nickname } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: "Se espera sessionId" });
  }

  const session = await sesionesCollection.findOne({ sessionId });

  if (!session) {
    return res.status(404).json({ message: "Sesión no encontrada" });
  }

  const now = new Date();
  const updates = { lastAccessed: now };

  if (email) updates.email = email;
  if (nickname) updates.nickname = nickname;

  await sesionesCollection.updateOne({ sessionId }, { $set: updates });

  res.status(200).json({ message: "Sesión actualizada", sessionId });
});

// Endpoint: Session Status
app.get("/status", async (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ message: "Se espera sessionId" });
  }

  const session = await sesionesCollection.findOne({ sessionId });

  if (!session) {
    return res.status(404).json({ message: "Sesión no encontrada" });
  }

  const now = new Date();
  const duration = Math.floor((now - new Date(session.createdAt)) / 1000);
  const inactivity = Math.floor((now - new Date(session.lastAccessed)) / 1000);

  res.status(200).json({
    message: "Sesión activa",
    session: {
      ...session,
      duration,
      inactivity,
    },
  });
});

// Endpoint: Bienvenida
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Bienvenido a la API de control de sesiones",
    author: "T.S.U Erick Matías Granillo Mejía",
  });
});

// Iniciar servidor
app.listen(Port, () => {
  console.log(`Servidor inicializado en http://localhost:${Port}`);
});