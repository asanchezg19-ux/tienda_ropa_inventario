"use strict";

const fs = require("fs");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const IS_LOCAL = process.env.PERSISTENCE_MODE === "local";

let docClient = null;
if (!IS_LOCAL) {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
  docClient = DynamoDBDocumentClient.from(client);
}

async function obtenerDatos(archivoLocal, nombreTablaAWS, valorPorDefecto = []) {
  if (IS_LOCAL) {
    if (!fs.existsSync(archivoLocal)) return valorPorDefecto;
    return JSON.parse(fs.readFileSync(archivoLocal, "utf8"));
  } else {
    try {
      const command = new ScanCommand({ TableName: nombreTablaAWS });
      const response = await docClient.send(command);
      return response.Items || valorPorDefecto;
    } catch (err) {
      console.error(`Error escaneando tabla AWS ${nombreTablaAWS}:`, err.message);
      return valorPorDefecto;
    }
  }
}

async function guardarDatos(archivoLocal, nombreTablaAWS, datos, registroIndividualAWS = null) {
  if (IS_LOCAL) {
    fs.writeFileSync(archivoLocal, JSON.stringify(datos, null, 2), "utf8");
  } else {
    if (!registroIndividualAWS) return;
    // Puede ser un solo registro (alta/edición) o varios (ej. stock de
    // varios productos afectados por una misma venta).
    const registros = Array.isArray(registroIndividualAWS) ? registroIndividualAWS : [registroIndividualAWS];
    for (const item of registros) {
      await docClient.send(new PutCommand({ TableName: nombreTablaAWS, Item: item }));
    }
  }
}

async function eliminarDato(archivoLocal, nombreTablaAWS, datosActualizados, idEliminado) {
  if (IS_LOCAL) {
    fs.writeFileSync(archivoLocal, JSON.stringify(datosActualizados, null, 2), "utf8");
  } else {
    await docClient.send(new DeleteCommand({ TableName: nombreTablaAWS, Key: { id: idEliminado } }));
  }
}

module.exports = {
  IS_LOCAL,
  obtenerDatos,
  guardarDatos,
  eliminarDato
};
