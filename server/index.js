import { createClient } from '@libsql/client'
import dotenv from 'dotenv'
import express from 'express'
import logger from 'morgan'
import path from 'node:path'

import { createServer } from 'node:http'
import { Server } from 'socket.io'

dotenv.config()

const port = process.env.PORT ?? 3000

const app = express()
const server = createServer(app)
const io = new Server(server, {
  connectionStateRecovery: {}
})

const db = createClient({
  url: process.env.DB_URL,
  authToken: process.env.DB_TOKEN
})

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    username TEXT
  )
`)

io.on('connect', async (socket) => {
  console.log('a user has connected!')

  socket.on('disconnect', () => {
    console.log('a user has disconnected')
  })

  socket.on('chat message', async (msg) => {
    const username = socket.handshake.auth.username ?? 'anonymus'
    let result

    try {
      result = await db.execute({
        sql: 'INSERT INTO messages(content, username) VALUES(:msg, :username)',
        args: { msg, username }
      })
    } catch (e) {
      console.log(e)
      return
    }

    io.emit('chat message', msg, result.lastInsertRowid.toString(), username)
  })

  // recuperas los mensajes sin conexión
  if (!socket.recovered) {
    try {
      const serverOffset = socket.handshake.auth.serverOffset ?? '0'

      const results = await db.execute({
        sql: 'SELECT id, content, username FROM messages WHERE id > ?',
        args: [serverOffset]
      })

      results.rows.forEach((row) => {
        socket.emit('chat message', row.content, row.id.toString(), row.username)
      })
    } catch (e) {
      console.log(e)
    }
  }
})

app.use(logger('dev'))

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'client/index.html'))
})

server.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
