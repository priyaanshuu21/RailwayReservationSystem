// RailNexus - Phase 7: create the MongoDB time-series collection used for IoT
// reading snapshots. Idempotent: safe to run on every container start.
// Usage: node db/mongo/init-timeseries.mjs

import { MongoClient } from 'mongodb'

const url = process.env.MONGO_URL ?? 'mongodb://localhost:27017'
const dbName = process.env.MONGO_DB ?? 'railnexus'
const collection = process.env.IOT_MONGO_COLLECTION ?? 'sensor_readings'

const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 })

try {
  await client.connect()
  const db = client.db(dbName)
  const existing = await db.listCollections({ name: collection }).toArray()

  if (existing.length === 0) {
    await db.createCollection(collection, {
      timeseries: {
        timeField: 'ts',
        metaField: 'sensor',
        granularity: 'seconds'
      }
    })
    console.log(`created time-series collection ${dbName}.${collection}`)
  } else {
    console.log(`time-series collection ${dbName}.${collection} already exists`)
  }

  await db.collection(collection).createIndex({ 'sensor.sensorId': 1, ts: -1 })
  console.log('iot time-series index ready')
} finally {
  await client.close()
}
