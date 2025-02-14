import express from "express";
import bodyParser from "body-parser";
import sessions from "express-session";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import { MongoClient } from "mongodb";
import moment from "moment-timezone";

// Cargar variables de entorno desde .env
dotenv.config();

const app = express(); 
const Port = 3000;
 
// Configuración de MongoDB
const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = "SesionesDB";
let sesionesCollection;

(async () => {
  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);
    sesionesCollection = db.collection("sesiones");
    console.log("✅ Conectado a MongoDB");
  } catch (error) {
    console.error("❌ Error conectando a MongoDB:", error);
  }
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
    cookie: { maxAge: 5 * 60 * 1000 }, // 5 minutos en milisegundos
  })
);

// Función para obtener información de la red del servidor
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

// Función para obtener la IP del cliente
// Función para obtener la IP del cliente sin el prefijo "::ffff:"
const getClientIP = (req) => {
  const rawIp =
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket?.remoteAddress;
  return typeof rawIp === "string" ? rawIp.replace(/^::ffff:/, "") : rawIp;
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
    const formattedNow = moment(now)
      .tz("America/Mexico_City")
      .format("YYYY-MM-DD HH:mm:ss");
    await sesionesCollection.updateOne(
      { sessionId: existingSession.sessionId },
      { $set: { lastAccessed: formattedNow, inactiveTime: 0 } }
    );

    return res.status(200).json({
      message: "Sesión reactivada",
      sessionId: existingSession.sessionId,
    });
  }

  const sessionId = uuidv4();
  const now = new Date();
  const formattedNow = moment(now)
    .tz("America/Mexico_City")
    .format("YYYY-MM-DD HH:mm:ss");
  const serverInfo = getServerNetworkInfo();

  const newSession = {
    sessionId,
    email,
    nickname,
    macAddress,
    clientIp: getClientIP(req),
    serverIp: serverInfo?.serverIp || "Desconocido",
    serverMac: serverInfo?.serverMac || "Desconocido",
    createdAt: formattedNow,
    lastAccessed: formattedNow,
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

  await sesionesCollection.updateOne(
    { sessionId },
    { $set: { status: "Finalizada por el Usuario" } }
  );

  res.status(200).json({ message: "Logout exitoso" });
});

// Endpoint: Update Session
app.put("/update", async (req, res) => {
  const { sessionId, email, nickname } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: "Se espera sessionId" });
  }

  const now = moment()
    .tz("America/Mexico_City")
    .format("YYYY-MM-DD HH:mm:ss");

  const updates = { lastAccessed: now };

  if (email) updates.email = email;
  if (nickname) updates.nickname = nickname;

  await sesionesCollection.updateOne({ sessionId }, { $set: updates });

  res.status(200).json({ message: "Sesión actualizada", sessionId });
});

// Endpoint: Status con cierre por inactividad
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
  const duration = Math.floor((now - new Date(session.createdAt)) / 1000); // en segundos
  const inactivity = Math.floor((now - new Date(session.lastAccessed)) / 1000); // en segundos

  const maxInactivity = 10 * 60; // 10 minutos en segundos

  // Actualizar inactiveTime en la base de datos
  await sesionesCollection.updateOne(
    { sessionId },
    { $set: { inactiveTime: inactivity } }
  );

  if (inactivity >= maxInactivity) {
    await sesionesCollection.updateOne(
      { sessionId },
      { $set: { status: "Inactiva" } }
    );

    return res.status(403).json({ message: "Sesión cerrada por inactividad" });
  }

  // Convertir las fechas a formato "YYYY-MM-DD HH:mm:ss" en la zona horaria America/Mexico_City
  session.createdAt = moment(session.createdAt)
    .tz("America/Mexico_City")
    .format("YYYY-MM-DD HH:mm:ss");
  session.lastAccessed = moment(session.lastAccessed)
    .tz("America/Mexico_City")
    .format("YYYY-MM-DD HH:mm:ss");

  res.status(200).json({
    session: {
      ...session,
      duration,
      inactivity,
    },
  });
});

// Endpoint: Obtener todas las sesiones
app.get("/allSessions", async (req, res) => {
  const sesiones = await sesionesCollection.find({}).toArray();
  res.status(200).json(sesiones);
});

// Endpoint: Obtener todas las sesiones activas
app.get("/allCurrentSessions", async (req, res) => {
  const sesiones = await sesionesCollection.find({ status: "Activa" }).toArray();
  res.status(200).json(sesiones);
});

// Endpoint: Borrar todas las sesiones (⚠️ PELIGROSO)
app.delete("/deleteAllSessions", async (req, res) => {
  await sesionesCollection.deleteMany({});
  res.status(200).json({ message: "Todas las sesiones han sido eliminadas" });
});

// Endpoint: Finalizar sesión por fallo de sistema
app.post("/terminateSession", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: "Se espera sessionId" });
  }

  await sesionesCollection.updateOne(
    { sessionId },
    { $set: { status: "Finalizada por Falla de Sistema" } }
  );

  res.status(200).json({ message: "Sesión finalizada por falla de sistema" });
});

// Endpoint: Bienvenida
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Bienvenido a la API de control de sesiones",
    author: "Erick Matias Granillo Mejia",
  });
});

// Iniciar servidor
app.listen(Port, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${Port}`);
});
